import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ShellUserAgent } from '../shell-user-agent';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '@all-in-one/api/auth';
import { storeFromUserAgent } from '../in-app-notifications';
import {
  type TelegramLinkRequest,
  type TelegramRewardCheck,
  type TelegramStatus,
  telegramLinkRequestSchema,
} from '@all-in-one/shared/schemas';
import { TelegramService } from './telegram.service';

/** The signed-in account's Telegram link (directive 168); the webhook itself is mounted in `main.ts`. */
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get('status')
  status(
    @CurrentUser() user: AuthUser,
    @ShellUserAgent() userAgent: string,
  ): Promise<TelegramStatus> {
    return this.telegram.status(user.id, storeFromUserAgent(userAgent));
  }

  @Post('link')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  link(
    @CurrentUser() user: AuthUser,
    @Body({ schema: telegramLinkRequestSchema }) input: TelegramLinkRequest,
    @ShellUserAgent() userAgent: string,
  ): Promise<{ url: string }> {
    return this.telegram.createLink(
      user.id,
      input.language ?? 'fa',
      storeFromUserAgent(userAgent),
    );
  }

  /** The Telegram week, checked by the bot instead of support (directive 189). */
  @Post('reward')
  @HttpCode(200)
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  async reward(
    @CurrentUser() user: AuthUser,
    @ShellUserAgent() userAgent: string,
  ): Promise<{ result: TelegramRewardCheck }> {
    return {
      result: await this.telegram.claimChannelWeek(
        user.id,
        new Date(),
        storeFromUserAgent(userAgent),
      ),
    };
  }

  @Delete('link')
  unlink(@CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    return this.telegram.unlink(user.id);
  }
}
