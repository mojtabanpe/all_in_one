import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import { Throttle } from '@nestjs/throttler';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  type EmailOnlyInput,
  emailOnlySchema,
  type LoginInput,
  loginSchema,
  type RegisterInput,
  type RegisterResult,
  registerSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
  type User,
  type VerifyEmailInput,
  verifyEmailSchema,
  resendVerificationSchema,
  type ResendVerificationInput,
  phoneStartSchema,
  type PhoneStartInput,
  phoneConfirmSchema,
  type PhoneConfirmInput,
  phoneResetRequestSchema,
  type PhoneResetRequestInput,
  phoneResetSchema,
  type PhoneResetInput,
  type PhoneState,
  smsLoginRequestSchema,
  type SmsLoginRequestInput,
  smsLoginSchema,
  type SmsLoginInput,
  type SmsLoginResult,
} from '@all-in-one/shared/schemas';
import type { User as DbUser } from '@all-in-one/api/db';
import { type AuthUser, CurrentUser, Public } from './auth.decorators';
import { SESSION_COOKIE } from './auth.guard';
import { AuthService, toUser } from './auth.service';
import { PhoneService } from './phone.service';

const SESSION_SECONDS = 60 * 60 * 24 * 7;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: ConfigService,
    private readonly phones: PhoneService,
  ) {}

  /** Whether SMS is on, the account's confirmed number and one waiting for its code. */
  @Get('phone')
  phone(@CurrentUser() current: AuthUser): Promise<PhoneState> {
    return this.phones.state(current.id);
  }

  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Post('phone')
  startPhone(
    @CurrentUser() current: AuthUser,
    @Body({ schema: phoneStartSchema }) input: PhoneStartInput,
  ): Promise<PhoneState> {
    return this.phones.start(current.id, input.phone);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('phone/confirm')
  confirmPhone(
    @CurrentUser() current: AuthUser,
    @Body({ schema: phoneConfirmSchema }) input: PhoneConfirmInput,
  ): Promise<PhoneState> {
    return this.phones.confirm(current.id, input.code);
  }

  @Delete('phone')
  removePhone(@CurrentUser() current: AuthUser): Promise<PhoneState> {
    return this.phones.remove(current.id);
  }

  /** Whether «forgot password» can offer SMS (no account data). */
  @Public()
  @Get('sms')
  smsStatus(): { enabled: boolean } {
    return { enabled: this.phones.enabled };
  }

  /** Sends a sign-in code to any valid number (directive 119); the answer never says whether an account has it. */
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Post('sms-login/request')
  async requestSmsLogin(
    @Body({ schema: smsLoginRequestSchema }) input: SmsLoginRequestInput,
  ): Promise<void> {
    await this.phones.requestLogin(input.phone);
  }

  /** A right code signs in, or creates an account with the number alone, and starts a session. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('sms-login')
  async smsLogin(
    @Body({ schema: smsLoginSchema }) input: SmsLoginInput,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<SmsLoginResult> {
    const phone = await this.phones.verifyLogin(input.phone, input.code);
    const { user, created } = await this.auth.signInByPhone(
      phone,
      input.acquisition,
    );
    await this.startSession(res, user);
    return { user: toUser(user), created };
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Post('forgot-password-sms')
  async forgotPasswordSms(
    @Body({ schema: phoneResetRequestSchema }) input: PhoneResetRequestInput,
  ): Promise<void> {
    await this.phones.requestReset(input.phone);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('reset-password-sms')
  async resetPasswordSms(
    @Body({ schema: phoneResetSchema }) input: PhoneResetInput,
  ): Promise<void> {
    await this.phones.reset(input.phone, input.code, input.password);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body({ schema: registerSchema }) input: RegisterInput,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<RegisterResult> {
    const user = await this.auth.register(input);
    if (!user.emailVerifiedAt)
      return { status: 'verify-email', email: user.email ?? input.email };
    await this.startSession(res, user);
    return { status: 'signed-in', user: toUser(user) };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  @Post('verify-email')
  verifyEmail(
    @Body({ schema: verifyEmailSchema }) input: VerifyEmailInput,
  ): Promise<{ rewardedWeek: boolean }> {
    return this.auth.verifyEmail(input.token);
  }

  /** A phone-only account adds an email; it is stored once the emailed link is opened (directive 121). */
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Post('email')
  async addEmail(
    @CurrentUser() current: AuthUser,
    @Body({ schema: emailOnlySchema }) input: EmailOnlyInput,
  ): Promise<void> {
    await this.auth.requestEmail(current.id, input.email);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Post('resend-verification')
  resendVerification(
    @Body({ schema: resendVerificationSchema }) input: ResendVerificationInput,
  ): void {
    this.auth.requestVerification(input.email, input.campaign);
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(202)
  @Post('forgot-password')
  forgotPassword(
    @Body({ schema: emailOnlySchema }) input: EmailOnlyInput,
  ): void {
    this.auth.requestPasswordReset(input.email);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('reset-password')
  async resetPassword(
    @Body({ schema: resetPasswordSchema }) input: ResetPasswordInput,
  ): Promise<void> {
    await this.auth.resetPassword(input.token, input.password);
  }

  /** Changes the password; this session gets a fresh cookie, others are signed out. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(204)
  @Post('password')
  async changePassword(
    @CurrentUser() current: AuthUser,
    @Body({ schema: changePasswordSchema }) input: ChangePasswordInput,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<void> {
    const user = await this.auth.changePassword(
      current.id,
      input.currentPassword,
      input.newPassword,
    );
    await this.startSession(res, user);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body({ schema: loginSchema }) input: LoginInput,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<User> {
    const user = await this.auth.login(input);
    await this.startSession(res, user);
    return toUser(user);
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: unknown): void {
    this.adapterHost.httpAdapter.clearCookie?.(res, SESSION_COOKIE, {
      path: '/',
    });
  }

  @Get('me')
  async me(@CurrentUser() current: AuthUser): Promise<User> {
    const user = await this.auth.findById(current.id);
    if (!user) throw new NotFoundException();
    return toUser(user);
  }

  private async startSession(res: unknown, user: DbUser): Promise<void> {
    this.adapterHost.httpAdapter.setCookie?.(
      res,
      SESSION_COOKIE,
      await this.auth.sign(user),
      {
        httpOnly: true,
        secure: this.config.get<string>('NODE_ENV') === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_SECONDS, // seconds in Nest 12
      },
    );
  }
}
