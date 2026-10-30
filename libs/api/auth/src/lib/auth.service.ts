import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type {
  LoginInput,
  RegisterInput,
  User,
} from '@all-in-one/shared/schemas';
import { PrismaService, type User as DbUser } from '@all-in-one/api/db';
import { MailService } from './mail.service';
import { hashPassword, verifyPassword } from './password';

const RESET_LIFETIME = 60 * 60 * 1000;
const VERIFY_LIFETIME = 24 * 60 * 60 * 1000;

/** Only hashes of emailed tokens are stored. */
export const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

export function toUser(user: DbUser): User {
  return {
    id: user.id,
    email: user.email,
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
      throw new ServiceUnavailableException('ثبت‌نام به ایمیل نیاز دارد که فعلاً در دسترس نیست.');
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
    if (verify)
      this.sendVerificationLink(email).catch((error: Error) =>
        this.logger.error('Verification email failed: ' + error.message),
      );
    return user;
  }

  async login(input: LoginInput): Promise<DbUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    // Same error for unknown email and wrong password: no account enumeration.
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }
    if (!user.emailVerifiedAt)
      throw new ForbiddenException('اول ایمیلت را تأیید کن؛ لینک تأیید به صندوقت فرستاده شده.');
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
  requestVerification(email: string): void {
    if (!this.mail.enabled)
      throw new ServiceUnavailableException('ایمیل فعلاً در دسترس نیست.');
    this.sendVerificationLink(email).catch((error: Error) =>
      this.logger.error('Verification email failed: ' + error.message),
    );
  }

  private async sendVerificationLink(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user || user.emailVerifiedAt) return;
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
      subject: 'ایمیلت را در «همه در یک» تأیید کن',
      text: [
        'خوش آمدی! برای تمام کردن ساخت حساب، ایمیلت را تأیید کن',
        '(لینک یک بار و تا ۲۴ ساعت کار می‌کند):',
        this.mail.link('verify-email', token),
        '',
        'اگر ثبت‌نام نکرده‌ای، این ایمیل را نادیده بگیر.',
      ].join('\n'),
    });
  }

  /** Uses a confirmation token once. */
  async verifyEmail(token: string): Promise<void> {
    const confirmed = await this.prisma.$transaction(async (tx) => {
      const row = await tx.emailVerification.findFirst({
        where: { tokenHash: digest(token), expiresAt: { gt: new Date() } },
      });
      if (!row) return false;
      const used = await tx.emailVerification.deleteMany({
        where: { tokenHash: row.tokenHash },
      });
      if (!used.count) return false;
      const user = await tx.user.findUniqueOrThrow({ where: { id: row.userId } });
      if (!user.emailVerifiedAt)
        await tx.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: new Date() },
        });
      return true;
    });
    if (!confirmed)
      throw new BadRequestException('این لینک تأیید نامعتبر است یا منقضی شده.');
  }

  /** Changes the password and signs out every other session; returns the user for a fresh cookie. */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<DbUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash)))
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
    this.notify(updated.email, 'رمز حسابت در «همه در یک» عوض شد');
    return updated;
  }

  /**
   * Emails a single-use reset link in the background and answers the same way
   * for unknown accounts, so the response does not reveal them.
   */
  requestPasswordReset(email: string): void {
    if (!this.mail.enabled)
      throw new ServiceUnavailableException('بازیابی رمز با ایمیل فعلاً در دسترس نیست.');
    this.sendResetLink(email).catch((error: Error) =>
      this.logger.error('Password reset email failed: ' + error.message),
    );
  }

  private async sendResetLink(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) return;
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
      subject: 'بازیابی رمز «همه در یک»',
      text: [
        'کسی خواسته رمز حسابت در «همه در یک» را عوض کند.',
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
      const current = await tx.user.findUniqueOrThrow({ where: { id: row.userId } });
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
      throw new BadRequestException('این لینک بازیابی نامعتبر است یا منقضی شده.');
    this.notify(user.email, 'رمز حسابت در «همه در یک» بازنشانی شد');
  }

  /** Security notice; a mail failure must not undo the password change. */
  private notify(email: string, subject: string): void {
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
