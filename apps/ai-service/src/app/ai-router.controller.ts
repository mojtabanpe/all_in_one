import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import * as z from 'zod/mini';
import {
  AiRouterService,
  type ChatCompletionPayload,
} from './ai-router.service';

const chatRequestSchema = z.object({
  model: z.optional(z.string()),
  messages: z.array(z.unknown()).check(z.minLength(1)),
  temperature: z.optional(z.number()),
  max_tokens: z.optional(z.number()),
  stream: z.optional(z.boolean()),
  tools: z.optional(z.array(z.unknown())),
  tool_choice: z.optional(z.unknown()),
  response_format: z.optional(z.unknown()),
});

@Controller()
export class AiRouterController {
  constructor(private readonly router: AiRouterService) {}

  @Get('health')
  @Header('Cache-Control', 'no-store')
  health() {
    return this.router.health();
  }

  @Get('v1/models')
  @Header('Cache-Control', 'no-store')
  models(@Headers('authorization') authorization: string | undefined) {
    if (!this.router.isAuthorized(authorization)) {
      throw new UnauthorizedException();
    }
    return this.router.models();
  }

  @Post('v1/chat/completions')
  @Header('Cache-Control', 'no-store')
  async chatCompletions(
    @Headers('authorization') authorization: string | undefined,
    @Body({ schema: chatRequestSchema }) body: ChatCompletionPayload,
    @Res() res: Response,
  ) {
    if (!this.router.isAuthorized(authorization)) {
      throw new UnauthorizedException();
    }
    const result = await this.router.chatCompletions(body);
    res
      .status(result.status)
      .setHeader('X-AI-Provider', result.provider)
      .setHeader('X-AI-Fallback', String(result.fellBack))
      .json(result.body);
  }
}
