import {
  Body,
  Controller,
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
  type LoginInput,
  loginSchema,
  type RegisterInput,
  registerSchema,
  type User,
} from '@all-in-one/shared/schemas';
import type { User as DbUser } from '@all-in-one/api/db';
import { type AuthUser, CurrentUser, Public } from './auth.decorators';
import { SESSION_COOKIE } from './auth.guard';
import { AuthService, toUser } from './auth.service';

const SESSION_SECONDS = 60 * 60 * 24 * 7;

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @Body({ schema: registerSchema }) input: RegisterInput,
    @Res({ passthrough: true }) res: unknown,
  ): Promise<User> {
    const user = await this.auth.register(input);
    await this.startSession(res, user);
    return toUser(user);
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
