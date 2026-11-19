import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type AuthUser, CurrentUser } from '@all-in-one/api/auth';
import {
  type TelegramLinkRequest,
  type TelegramStatus,
  telegramLinkRequestSchema,
} from '@all-in-one/shared/schemas';
import { TelegramService } from './telegram.service';

/** The signed-in account's Telegram link (directive 168); the webhook itself is mounted in `main.ts`. */
@Controller('telegram')
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  @Get('status')
  status(@CurrentUser() user: AuthUser): Promise<TelegramStatus> {
    return this.telegram.status(user.id);
  }

  @Post('link')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  link(
    @CurrentUser() user: AuthUser,
    @Body({ schema: telegramLinkRequestSchema }) input: TelegramLinkRequest,
  ): Promise<{ url: string }> {
    return this.telegram.createLink(user.id, input.language ?? 'fa');
  }

  @Delete('link')
  unlink(@CurrentUser() user: AuthUser): Promise<{ ok: true }> {
    return this.telegram.unlink(user.id);
  }
}
