import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AiGateway } from '@all-in-one/api/ai';
import { type AuthUser, CurrentUser } from '@all-in-one/api/auth';
import {
  type AssistantReply,
  type AssistantRequest,
  assistantRequestSchema,
} from '@all-in-one/shared/schemas';
import { AssistantService } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  constructor(
    private readonly assistant: AssistantService,
    private readonly gateway: AiGateway,
  ) {}

  @Post('chat')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  chat(
    @CurrentUser() user: AuthUser,
    @Body({ schema: assistantRequestSchema }) input: AssistantRequest,
  ): Promise<AssistantReply> {
    return this.assistant.chat(user.id, input);
  }

  /** Voice input: a raw recording (audio/webm, …) → text, with the user's STT. */
  @Post('transcribe')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async transcribe(
    @CurrentUser() user: AuthUser,
    @Req() request: Request,
  ): Promise<{ text: string }> {
    return {
      text: await this.gateway.transcribe(
        user.id,
        request.body,
        request.headers['content-type'] ?? '',
      ),
    };
  }
}
