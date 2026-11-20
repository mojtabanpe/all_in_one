import { randomInt } from 'node:crypto';
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Post,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthUser } from '@all-in-one/api/auth';
import { Prisma, PrismaService } from '@all-in-one/api/db';
import {
  normalizeReferralCode,
  referralAttachSchema,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_ENTER_DAYS,
  REFERRAL_MAX_WEEKS,
  REFERRAL_REWARD_DAYS,
  type ReferralAttachInput,
  type ReferralStatus,
} from '@all-in-one/shared/schemas';
import { BillingService } from './billing.service';

const DAY = 86_400_000;
const SWEEP_MS = 10 * 60_000;

export function newReferralCode(pick = randomInt): string {
  let code = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++)
    code += REFERRAL_CODE_ALPHABET[pick(REFERRAL_CODE_ALPHABET.length)];
  return code;
}

/**
 * Invite a friend (directive 183). Every account has a code; a new account joins through the link or enters the
 * code by hand within `REFERRAL_ENTER_DAYS`. Once the friend has a confirmed account and a first real action (a
 * task, a card, a review, a meal or a workout) within `REFERRAL_REWARD_DAYS`, both get a week, queued like every
 * other earned week.
 */
@Injectable()
export class ReferralService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReferralService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(
    private readonly db: PrismaService,
    private readonly billing: BillingService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async status(userId: string, now = new Date()): Promise<ReferralStatus> {
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        role: true,
        createdAt: true,
        inviteCode: true,
        referral: { select: { inviterId: true } },
      },
    });
    const code = user.inviteCode ?? (await this.createCode(userId));
    const [invited, rewarded] = await Promise.all([
      this.db.referral.count({ where: { inviterId: userId } }),
      this.db.billingReward.count({
        where: { userId, campaign: 'REFERRAL_INVITER' },
      }),
    ]);
    return {
      code,
      invited,
      rewarded,
      weeksLeft: Math.max(0, REFERRAL_MAX_WEEKS - rewarded),
      invitedBy: !!user.referral,
      canEnter:
        user.role === 'CUSTOMER' &&
        !user.referral &&
        now.getTime() - user.createdAt.getTime() < REFERRAL_ENTER_DAYS * DAY,
    };
  }

  /** The invited account names who invited it, once; the weeks follow its first real action. */
  async attach(
    userId: string,
    input: ReferralAttachInput,
    now = new Date(),
  ): Promise<ReferralStatus> {
    const code = normalizeReferralCode(input.code);
    const inviter = code
      ? await this.db.user.findUnique({
          where: { inviteCode: code },
          select: {
            id: true,
            role: true,
            referral: { select: { inviterId: true } },
          },
        })
      : null;
    if (!inviter || inviter.role !== 'CUSTOMER')
      throw new NotFoundException('این کد دعوت پیدا نشد.');
    if (inviter.id === userId)
      throw new UnprocessableEntityException(
        'کد دعوت خودت را نمی‌شود وارد کرد.',
      );
    // Two accounts cannot invite each other.
    if (inviter.referral?.inviterId === userId)
      throw new UnprocessableEntityException('این کد دعوت پذیرفته نمی‌شود.');
    const status = await this.status(userId, now);
    if (status.invitedBy)
      throw new ConflictException('قبلاً کد دعوت وارد کرده‌ای.');
    if (!status.canEnter)
      throw new UnprocessableEntityException(
        'کد دعوت فقط تا یک هفته بعد از ثبت‌نام پذیرفته می‌شود.',
      );
    try {
      await this.db.referral.create({
        data: { inviteeId: userId, inviterId: inviter.id, createdAt: now },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('قبلاً کد دعوت وارد کرده‌ای.');
      throw error;
    }
    // A friend who already did something earns the weeks at once.
    await this.settle(userId, inviter.id, now);
    return this.status(userId, now);
  }

  /** Grants both weeks when the invited account is ready; returns whether it was settled. */
  async settle(
    inviteeId: string,
    inviterId: string,
    now = new Date(),
  ): Promise<boolean> {
    if (!(await this.ready(inviteeId))) return false;
    await this.billing.grantReferral(inviteeId, inviterId, now);
    await this.db.referral.updateMany({
      where: { inviteeId, rewardedAt: null },
      data: { rewardedAt: now },
    });
    return true;
  }

  async sweep(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const open = await this.db.referral.findMany({
        where: {
          rewardedAt: null,
          createdAt: {
            gte: new Date(now.getTime() - REFERRAL_REWARD_DAYS * DAY),
          },
        },
        select: { inviteeId: true, inviterId: true },
        take: 200,
      });
      for (const { inviteeId, inviterId } of open)
        await this.settle(inviteeId, inviterId, now).catch(() =>
          // Counts only: never an account id.
          this.logger.warn('An invitation could not be settled'),
        );
    } catch {
      this.logger.error('Invitation sweep failed');
    } finally {
      this.running = false;
    }
  }

  /** A confirmed account with something of its own. */
  private async ready(userId: string): Promise<boolean> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { role: true, emailVerifiedAt: true, phoneVerifiedAt: true },
    });
    if (
      !user ||
      user.role !== 'CUSTOMER' ||
      (!user.emailVerifiedAt && !user.phoneVerifiedAt)
    )
      return false;
    const where = { where: { userId }, select: { userId: true } };
    const found = await Promise.all([
      this.db.plannerTask.findFirst(where),
      this.db.englishCard.findFirst(where),
      this.db.englishReviewDay.findFirst(where),
      this.db.mealLog.findFirst(where),
      this.db.workoutLog.findFirst(where),
    ]);
    return found.some(Boolean);
  }

  /** A fresh unique code; a rare collision tries again. */
  private async createCode(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newReferralCode();
      try {
        const { count } = await this.db.user.updateMany({
          where: { id: userId, inviteCode: null },
          data: { inviteCode: code },
        });
        if (count) return code;
        // Another request made it first.
        const user = await this.db.user.findUniqueOrThrow({
          where: { id: userId },
          select: { inviteCode: true },
        });
        if (user.inviteCode) return user.inviteCode;
      } catch (error) {
        if (!(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ))
          throw error;
      }
    }
    throw new ConflictException('ساختن کد دعوت ممکن نشد. دوباره امتحان کن.');
  }
}

@Controller('referral')
export class ReferralController {
  constructor(private readonly referrals: ReferralService) {}

  @Get()
  status(@CurrentUser() user: AuthUser) {
    return this.referrals.status(user.id);
  }

  /** Throttled so codes cannot be guessed by trying many. */
  @Post('attach')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  attach(
    @CurrentUser() user: AuthUser,
    @Body({ schema: referralAttachSchema }) input: ReferralAttachInput,
  ) {
    return this.referrals.attach(user.id, input);
  }
}
