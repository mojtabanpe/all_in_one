import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { growthCampaignSchema } from '@all-in-one/shared/schemas';
import type {
  GrowthAttribution,
  LoginInput,
  RegisterInput,
  User,
  GrowthCampaign,
} from '@all-in-one/shared/schemas';
import { PrismaService, type User as DbUser } from '@all-in-one/api/db';
import { MailService } from './mail.service';
import { hashPassword, isLegacyHash, verifyPassword } from './password';
import { SmsService } from './sms.service';
import { ContactEvents } from './contact-events';

const RESET_LIFETIME = 60 * 60 * 1000;
const VERIFY_LIFETIME = 24 * 60 * 60 * 1000;

/** Only hashes of emailed tokens are stored. */
export const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

/**
 * The campaign of a visitor's earliest tagged event. A paid link's campaign is lost when the URL
 * does not survive — an installed PWA or the native shell opens without a query string — so the
 * signup copies the first touch the same visitor already recorded. Untagged junk is ignored.
 */
export function firstTouchCampaign(
  events: readonly { campaign: unknown }[],
): GrowthCampaign | undefined {
  for (const event of events) {
    const parsed = growthCampaignSchema.safeParse(event.campaign);
    if (parsed.success && Object.keys(parsed.data).length) return parsed.data;
  }
  return undefined;
}

export function toUser(user: DbUser): User {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    hasPassword: user.passwordHash !== null,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Accounts, sessions, email confirmation and password reset (Recall's auth
 * flows on this app's JWT cookie). A session carries the user's
 * `sessionVersion`; bumping it signs every other session out.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    @Optional() private readonly sms?: SmsService,
    @Optional() private readonly events?: ContactEvents,
  ) {}

  /** New accounts confirm their email unless REQUIRE_EMAIL_VERIFICATION=false. */
  get verificationRequired(): boolean {
    return this.config.get<string>('REQUIRE_EMAIL_VERIFICATION') !== 'false';
  }

  /** Creates the account; returns it verified (sign in now) or waiting for the link. */
  async register(input: RegisterInput): Promise<DbUser> {
    const email = input.email.toLowerCase();
    const verify = this.verificationRequired;
    if (verify && !this.mail.enabled)
      throw new ServiceUnavailableException(
        'ثبت‌نام به ایمیل نیاز دارد که فعلاً در دسترس نیست.',
      );
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    }
    const user = await this.prisma.user.create({
      data: {
        email,
        name: input.name ?? null,
        passwordHash: await hashPassword(input.password),
        role: 'CUSTOMER',
        emailVerifiedAt: verify ? null : new Date(),
      },
    });
    await this.recordSignup(input.acquisition);
    if (verify)
      this.sendVerificationLink(email, input.acquisition?.campaign).catch(
        (error: Error) =>
          this.logger.error('Verification email failed: ' + error.message),
      );
    return user;
  }

  /**
   * A confirmed SMS sign-in code: signs into the account with that number, or creates one with the number alone
   * (directive 119; the trial starts now, from `phoneVerifiedAt`).
   */
  async signInByPhone(
    phone: string,
    acquisition?: GrowthAttribution,
  ): Promise<{ user: DbUser; created: boolean }> {
    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) return { user: existing, created: false };
    try {
      const user = await this.prisma.user.create({
        data: { phone, phoneVerifiedAt: new Date(), role: 'CUSTOMER' },
      });
      await this.recordSignup(acquisition);
      return { user, created: true };
    } catch (error) {
      // Another request created the account for this number first (unique phone).
      const raced = await this.prisma.user.findUnique({ where: { phone } });
      if (raced) return { user: raced, created: false };
      throw error;
    }
  }

  /**
   * The campaign to record with a signup: the one the client sent, or — when the URL lost it, as an
   * installed PWA or the native shell does — the campaign of that visitor's earliest tagged event.
   */
  private async signupCampaign(
    visitorId: string,
    given?: GrowthCampaign,
  ): Promise<GrowthCampaign | undefined> {
    if (given && Object.keys(given).length) return given;
    try {
      const events = await this.prisma.growthEvent.findMany({
        where: { visitorId },
        orderBy: { createdAt: 'asc' },
        take: 10,
        select: { campaign: true },
      });
      return firstTouchCampaign(events);
    } catch {
      // An analytics read must never cost the signup event itself.
      return undefined;
    }
  }

  /**
   * Only a successfully created account can emit this event. Analytics must never turn a successful
   * registration into an error or send auth fields.
   */
  private async recordSignup(acquisition?: GrowthAttribution): Promise<void> {
    if (
      !acquisition ||
      this.config.get<string>('GROWTH_ANALYTICS_ENABLED') === 'false'
    )
      return;
    try {
      const { visitorId, language } = acquisition;
      const campaign = await this.signupCampaign(
        visitorId,
        acquisition.campaign,
      );
      await this.prisma.growthEvent.createMany({
        data: [
          {
            visitorId,
            language,
            name: 'signup_completed',
            day: new Date().toLocaleDateString('en-CA', {
              timeZone: 'Asia/Tehran',
            }),
            ...(campaign ? { campaign } : {}),
          },
        ],
        skipDuplicates: true,
      });
    } catch {
      this.logger.warn('Signup acquisition event could not be recorded');
    }
  }

  async login(input: LoginInput): Promise<DbUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    // Same error for unknown email, no password and wrong password: no account enumeration.
    if (
      !user?.passwordHash ||
      !(await verifyPassword(input.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }
    if (!user.emailVerifiedAt)
      throw new ForbiddenException(
        'اول ایمیلت را تأیید کن؛ لینک تأیید به صندوقت فرستاده شده.',
      );
    if (isLegacyHash(user.passwordHash))
      return this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(input.password) },
      });
    return user;
  }

  findById(id: string): Promise<DbUser | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  sign(user: DbUser): Promise<string> {
    return this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      sv: user.sessionVersion,
    });
  }

  /** Emails a fresh confirmation link; silent for unknown or confirmed accounts. */
  requestVerification(email: string, campaign?: GrowthCampaign): void {
    if (!this.mail.enabled)
      throw new ServiceUnavailableException('ایمیل فعلاً در دسترس نیست.');
    this.sendVerificationLink(email, campaign).catch((error: Error) =>
      this.logger.error('Verification email failed: ' + error.message),
    );
  }

  private async sendVerificationLink(
    email: string,
    campaign?: GrowthCampaign,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user?.email || user.emailVerifiedAt) return;
    const token = newToken();
    await this.prisma.emailVerification.deleteMany({
      where: { OR: [{ expiresAt: { lte: new Date() } }, { userId: user.id }] },
    });
    await this.prisma.emailVerification.create({
      data: {
        tokenHash: digest(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + VERIFY_LIFETIME),
      },
    });
    await this.mail.send({
      to: user.email,
      subject: 'ایمیلت را در «Poshtetgarm» تأیید کن',
      text: [
        'خوش آمدی! برای تمام کردن ساخت حساب، ایمیلت را تأیید کن',
        '(لینک یک بار و تا ۲۴ ساعت کار می‌کند):',
        this.mail.link('verify-email', token, campaign),
        '',
        'اگر ثبت‌نام نکرده‌ای، این ایمیل را نادیده بگیر.',
      ].join('\n'),
    });
  }

  /**
   * A phone-only account adds an email (directive 121): a confirmation link goes to it, and the email is stored on
   * the account only when that link is opened.
   */
  async requestEmail(userId: string, input: string): Promise<void> {
    const email = input.trim().toLowerCase();
    if (!this.mail.enabled)
      throw new ServiceUnavailableException('ایمیل فعلاً در دسترس نیست.');
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (user.email)
      throw new BadRequestException('ایمیل این حساب قبلاً ثبت شده است.');
    if (await this.prisma.user.findUnique({ where: { email } }))
      throw new ConflictException('این ایمیل برای حساب دیگری ثبت شده است.');
    const token = newToken();
    await this.prisma.emailVerification.deleteMany({
      where: { OR: [{ expiresAt: { lte: new Date() } }, { userId }] },
    });
    await this.prisma.emailVerification.create({
      data: {
        tokenHash: digest(token),
        userId,
        email,
        expiresAt: new Date(Date.now() + VERIFY_LIFETIME),
      },
    });
    await this.mail.send({
      to: email,
      subject: 'ایمیلت را در «Poshtetgarm» تأیید کن',
      text: [
        'برای افزودن این ایمیل به حسابت در «Poshtetgarm»، روی لینک زیر بزن',
        '(لینک یک بار و تا ۲۴ ساعت کار می‌کند):',
        this.mail.link('verify-email', token),
        '',
        'اگر خودت نخواسته‌ای، این ایمیل را نادیده بگیر.',
      ].join('\n'),
    });
  }

  /**
   * Uses a confirmation token once. A link from «add email» also stores that email on the account. Returns whether
   * the confirmation earned the second-contact week (directive 121).
   */
  async verifyEmail(token: string): Promise<{ rewardedWeek: boolean }> {
    const userId = await this.prisma.$transaction(async (tx) => {
      const row = await tx.emailVerification.findFirst({
        where: { tokenHash: digest(token), expiresAt: { gt: new Date() } },
      });
      if (!row) return null;
      const used = await tx.emailVerification.deleteMany({
        where: { tokenHash: row.tokenHash },
      });
      if (!used.count) return null;
      const user = await tx.user.findUniqueOrThrow({
        where: { id: row.userId },
      });
      if (row.email) {
        if (user.email) return null;
        const taken = await tx.user.findUnique({
          where: { email: row.email },
          select: { id: true },
        });
        if (taken)
          throw new ConflictException('این ایمیل برای حساب دیگری ثبت شده است.');
        await tx.user.update({
          where: { id: user.id },
          data: { email: row.email, emailVerifiedAt: new Date() },
        });
      } else if (!user.emailVerifiedAt)
        await tx.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: new Date() },
        });
      return user.id;
    });
    if (!userId)
      throw new BadRequestException('این لینک تأیید نامعتبر است یا منقضی شده.');
    return { rewardedWeek: (await this.events?.confirmed(userId)) ?? false };
  }

  /** Changes the password and signs out every other session; returns the user for a fresh cookie. */
  /**
   * Sets the display name. A phone-only account (directive 119) is created without one, so this is
   * the only place it can be added.
   */
  async updateProfile(userId: string, name: string): Promise<DbUser> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: name.trim() },
    });
  }

  async changePassword(
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
  ): Promise<DbUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('رمز فعلی درست نیست.');
    // A phone-only account sets its first password without a current one.
    if (
      user.passwordHash &&
      !(await verifyPassword(currentPassword ?? '', user.passwordHash))
    )
      throw new BadRequestException('رمز فعلی درست نیست.');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.passwordReset.deleteMany({ where: { userId } });
      return tx.user.update({
        where: { id: userId },
        data: {
          passwordHash: await hashPassword(newPassword),
          sessionVersion: { increment: 1 },
        },
      });
    });
    this.notify(updated.email, 'رمز حسابت در «Poshtetgarm» عوض شد');
    this.sms?.notify('PASSWORD_CHANGED', updated.phone, {});
    return updated;
  }

  /**
   * Emails a single-use reset link in the background and answers the same way
   * for unknown accounts, so the response does not reveal them.
   */
  requestPasswordReset(email: string): void {
    if (!this.mail.enabled)
      throw new ServiceUnavailableException(
        'بازیابی رمز با ایمیل فعلاً در دسترس نیست.',
      );
    this.sendResetLink(email).catch((error: Error) =>
      this.logger.error('Password reset email failed: ' + error.message),
    );
  }

  private async sendResetLink(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user?.email) return;
    const token = newToken();
    await this.prisma.passwordReset.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    });
    await this.prisma.passwordReset.create({
      data: {
        tokenHash: digest(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_LIFETIME),
      },
    });
    await this.mail.send({
      to: user.email,
      subject: 'بازیابی رمز «Poshtetgarm»',
      text: [
        'کسی خواسته رمز حسابت در «Poshtetgarm» را عوض کند.',
        '',
        'رمز تازه را اینجا انتخاب کن (لینک یک بار و تا یک ساعت کار می‌کند):',
        this.mail.link('reset-password', token),
        '',
        'اگر خودت نبودی، این ایمیل را نادیده بگیر؛ رمزت عوض نمی‌شود.',
      ].join('\n'),
    });
  }

  /** Uses a reset token once: sets the password, confirms the email and signs out every session. */
  async resetPassword(token: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    const user = await this.prisma.$transaction(async (tx) => {
      const row = await tx.passwordReset.findFirst({
        where: { tokenHash: digest(token), expiresAt: { gt: new Date() } },
      });
      if (!row) return null;
      const used = await tx.passwordReset.deleteMany({
        where: { tokenHash: row.tokenHash },
      });
      if (!used.count) return null;
      const current = await tx.user.findUniqueOrThrow({
        where: { id: row.userId },
      });
      await tx.passwordReset.deleteMany({ where: { userId: row.userId } });
      return tx.user.update({
        where: { id: row.userId },
        data: {
          passwordHash,
          emailVerifiedAt: current.emailVerifiedAt ?? new Date(),
          sessionVersion: { increment: 1 },
        },
      });
    });
    if (!user)
      throw new BadRequestException(
        'این لینک بازیابی نامعتبر است یا منقضی شده.',
      );
    this.notify(user.email, 'رمز حسابت در «Poshtetgarm» بازنشانی شد');
    this.sms?.notify('PASSWORD_CHANGED', user.phone, {});
  }

  /** Security notice; a mail failure must not undo the password change. */
  private notify(email: string | null, subject: string): void {
    if (!email) return;
    this.mail
      .send({
        to: email,
        subject,
        text: [
          subject + ' و دستگاه‌های دیگر از حساب خارج شدند.',
          '',
          'اگر خودت نبودی، همین حالا رمزت را بازیابی کن: ' +
            new URL('login', this.mail.appUrl).href,
        ].join('\n'),
      })
      .catch((error: Error) =>
        this.logger.error('Password notice failed: ' + error.message),
      );
  }
}
