import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { iranMobile, type PhoneState } from '@all-in-one/shared/schemas';
import { PrismaService } from '@all-in-one/api/db';
import { hashPassword } from './password';
import { SmsService } from './sms.service';
import { ContactEvents } from './contact-events';

type Purpose = 'VERIFY' | 'RESET';

/** How long a code works, in minutes (sent as `%minutes%`). */
export const CODE_MINUTES: Record<Purpose, number> = { VERIFY: 5, RESET: 10 };
/** Sign-in/sign-up codes (LOGIN_CODE, directive 119). */
export const LOGIN_MINUTES = 5;
export const RESEND_AFTER_MS = 60_000;
/** Codes per account and purpose in 24 hours, and wrong guesses per code. */
export const DAILY_SENDS = 5;
export const MAX_ATTEMPTS = 5;
const DAY_MS = 86_400_000;

const codeHash = (userId: string, purpose: Purpose, code: string) =>
  createHash('sha256').update(`${userId}:${purpose}:${code}`).digest('hex');
const loginHash = (phone: string, code: string) =>
  createHash('sha256').update(`${phone}:LOGIN:${code}`).digest('hex');

function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}

const tooMany = (message: string) => new HttpException(message, 429);

/**
 * Mobile numbers by SMS code: confirm one for the signed-in account (AUTH_CODE), and reset the password with a
 * code sent to a confirmed number (PASSWORD_RESET). Only a code's hash is stored.
 */
@Injectable()
export class PhoneService {
  private readonly logger = new Logger(PhoneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    @Optional() private readonly events?: ContactEvents,
  ) {}

  get enabled(): boolean {
    return this.sms.enabled;
  }

  async state(userId: string, now = new Date()): Promise<PhoneState> {
    const [user, pending] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true },
      }),
      this.prisma.phoneCode.findUnique({
        where: { userId_purpose: { userId, purpose: 'VERIFY' } },
        select: { phone: true, expiresAt: true },
      }),
    ]);
    return {
      enabled: this.enabled,
      phone: user?.phone ?? null,
      pending: pending && pending.expiresAt > now ? pending.phone : null,
    };
  }

  /** Sends a code to a new number for the account. */
  async start(userId: string, input: string, now = new Date()) {
    const phone = this.parse(input);
    const owner = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (owner?.id === userId)
      throw new BadRequestException('این شماره قبلاً تأیید شده است.');
    if (owner)
      throw new ConflictException('این شماره برای حساب دیگری ثبت شده است.');
    await this.issue(userId, 'VERIFY', phone, now);
    return this.state(userId, now);
  }

  async confirm(userId: string, code: string, now = new Date()) {
    const phone = await this.check(userId, 'VERIFY', code, now);
    if (!phone) throw new BadRequestException('کد نادرست است یا منقضی شده.');
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { phone, phoneVerifiedAt: now },
      });
    } catch {
      // Confirmed by another account in the meantime (unique number).
      throw new ConflictException('این شماره برای حساب دیگری ثبت شده است.');
    }
    const rewardedWeek = (await this.events?.confirmed(userId)) ?? false;
    return { ...(await this.state(userId, now)), rewardedWeek };
  }

  async remove(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    // A phone-only account (directive 119) signs in with this number alone.
    if (!user.email)
      throw new BadRequestException(
        'این حساب با همین شماره وارد می‌شود؛ اول ایمیل اضافه کن.',
      );
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { phone: null, phoneVerifiedAt: null },
      }),
      this.prisma.phoneCode.deleteMany({ where: { userId } }),
    ]);
    return this.state(userId);
  }

  /**
   * Sends a reset code when the number belongs to an account. Answers the same way for unknown numbers, a
   * cooldown or a failed SMS, so the response reveals nothing about accounts.
   */
  async requestReset(input: string, now = new Date()): Promise<void> {
    if (!this.enabled) {
      // Same status as the email reset when it is off.
      throw new HttpException('بازیابی رمز با پیامک فعلاً در دسترس نیست.', 503);
    }
    const phone = this.parse(input);
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (!user) return;
    await this.issue(user.id, 'RESET', phone, now).catch((error: Error) =>
      this.logger.warn('Reset SMS not sent: ' + error.message),
    );
  }

  /** Sets a new password with a reset code and signs every session out; returns the account's id. */
  async reset(
    input: string,
    code: string,
    password: string,
    now = new Date(),
  ): Promise<{ id: string; phone: string }> {
    const fail = () => new BadRequestException('کد نادرست است یا منقضی شده.');
    const phone = iranMobile(input);
    if (!phone) throw fail();
    const user = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (!user || !(await this.check(user.id, 'RESET', code, now))) throw fail();
    const passwordHash = await hashPassword(password);
    await this.prisma.$transaction([
      this.prisma.passwordReset.deleteMany({ where: { userId: user.id } }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
      }),
    ]);
    this.sms.notify('PASSWORD_CHANGED', phone, {});
    return { id: user.id, phone };
  }

  /**
   * Sends a sign-in code to any valid number, whether an account has it or not (directive 119): the answer never
   * reveals accounts. The cooldown and daily cap are per number.
   */
  async requestLogin(input: string, now = new Date()): Promise<void> {
    if (!this.enabled)
      throw new HttpException('ورود با پیامک فعلاً در دسترس نیست.', 503);
    const phone = this.parse(input);
    const previous = await this.prisma.smsLoginCode.findUnique({
      where: { phone },
    });
    if (previous && now.getTime() - previous.sentAt.getTime() < RESEND_AFTER_MS)
      throw tooMany('یک دقیقه صبر کن و دوباره کد بخواه.');
    const freshWindow =
      !previous || now.getTime() - previous.windowStart.getTime() >= DAY_MS;
    const sends = freshWindow ? 1 : previous.sends + 1;
    if (sends > DAILY_SENDS)
      throw tooMany('امروز بیش از حد کد خواسته شده. فردا دوباره امتحان کن.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const data = {
      codeHash: loginHash(phone, code),
      expiresAt: new Date(now.getTime() + LOGIN_MINUTES * 60_000),
      attempts: 0,
      sentAt: now,
      sends,
      windowStart: freshWindow ? now : previous.windowStart,
    };
    await this.prisma.smsLoginCode.upsert({
      where: { phone },
      create: { phone, ...data },
      update: data,
    });
    try {
      await this.sms.send('LOGIN_CODE', phone, {
        code,
        minutes: String(LOGIN_MINUTES),
      });
    } catch (error) {
      // The code never arrived: it must not work, but the send still counts against the cap.
      await this.prisma.smsLoginCode.update({
        where: { phone },
        data: { expiresAt: now },
      });
      throw error;
    }
  }

  /** Uses a sign-in code once; a wrong one costs an attempt. Returns the confirmed number. */
  async verifyLogin(
    input: string,
    code: string,
    now = new Date(),
  ): Promise<string> {
    const fail = () => new BadRequestException('کد نادرست است یا منقضی شده.');
    const phone = iranMobile(input);
    if (!phone) throw fail();
    const row = await this.prisma.smsLoginCode.findUnique({ where: { phone } });
    if (!row || row.expiresAt <= now || row.attempts >= MAX_ATTEMPTS)
      throw fail();
    if (!sameHash(row.codeHash, loginHash(phone, code))) {
      await this.prisma.smsLoginCode.updateMany({
        where: { phone },
        data: { attempts: { increment: 1 } },
      });
      throw fail();
    }
    // Only one request can use the code (concurrent right guesses).
    const used = await this.prisma.smsLoginCode.updateMany({
      where: { phone, codeHash: row.codeHash, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
    if (used.count !== 1) throw fail();
    return phone;
  }

  private parse(input: string): string {
    const phone = iranMobile(input);
    if (!phone) throw new BadRequestException('شمارهٔ موبایل درست نیست.');
    return phone;
  }

  /** Stores a fresh code (cooldown and daily cap per account and purpose), then sends it. */
  private async issue(
    userId: string,
    purpose: Purpose,
    phone: string,
    now: Date,
  ): Promise<void> {
    const key = { userId_purpose: { userId, purpose } };
    const previous = await this.prisma.phoneCode.findUnique({ where: key });
    if (previous && now.getTime() - previous.sentAt.getTime() < RESEND_AFTER_MS)
      throw tooMany('یک دقیقه صبر کن و دوباره کد بخواه.');
    const freshWindow =
      !previous || now.getTime() - previous.windowStart.getTime() >= DAY_MS;
    const sends = freshWindow ? 1 : previous.sends + 1;
    if (sends > DAILY_SENDS)
      throw tooMany('امروز بیش از حد کد خواسته شده. فردا دوباره امتحان کن.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const minutes = CODE_MINUTES[purpose];
    const data = {
      phone,
      codeHash: codeHash(userId, purpose, code),
      expiresAt: new Date(now.getTime() + minutes * 60_000),
      attempts: 0,
      sentAt: now,
      sends,
      windowStart: freshWindow ? now : previous.windowStart,
    };
    await this.prisma.phoneCode.upsert({
      where: key,
      create: { userId, purpose, ...data },
      update: data,
    });
    try {
      await this.sms.send(
        purpose === 'VERIFY' ? 'AUTH_CODE' : 'PASSWORD_RESET',
        phone,
        { code, minutes: String(minutes) },
      );
    } catch (error) {
      // The code never arrived: it must not work, but the send still counts against the cap.
      await this.prisma.phoneCode.update({
        where: key,
        data: { expiresAt: now },
      });
      throw error;
    }
  }

  /** Checks a code once: a right one is used up; a wrong one costs an attempt. Returns the code's number. */
  private async check(
    userId: string,
    purpose: Purpose,
    code: string,
    now: Date,
  ): Promise<string | null> {
    const key = { userId_purpose: { userId, purpose } };
    const row = await this.prisma.phoneCode.findUnique({ where: key });
    if (!row || row.expiresAt <= now || row.attempts >= MAX_ATTEMPTS)
      return null;
    if (!sameHash(row.codeHash, codeHash(userId, purpose, code))) {
      await this.prisma.phoneCode.updateMany({
        where: { userId, purpose },
        data: { attempts: { increment: 1 } },
      });
      return null;
    }
    // Only one request can use the code (concurrent right guesses).
    const used = await this.prisma.phoneCode.updateMany({
      where: {
        userId,
        purpose,
        codeHash: row.codeHash,
        expiresAt: { gt: now },
      },
      data: { expiresAt: now },
    });
    return used.count === 1 ? row.phone : null;
  }
}
