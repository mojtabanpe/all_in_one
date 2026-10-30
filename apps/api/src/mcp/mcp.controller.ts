import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { type AuthUser, CurrentUser } from '@all-in-one/api/auth';
import {
  type CreateMcpKeyInput,
  createMcpKeySchema,
} from '@all-in-one/shared/schemas';
import { McpAuthService } from './mcp-auth.service';

/** Personal tokens for the ChatGPT connection (session auth + CSRF, like the rest of the api). */
@Controller('mcp/keys')
export class McpKeysController {
  constructor(private readonly auth: McpAuthService) {}

  /** The server url to paste into ChatGPT, and the user's tokens (never the secrets). */
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    return {
      serverUrl: this.auth.resource.href,
      keys: await this.auth.listKeys(user.id),
    };
  }

  /** The raw token is returned once and never stored. */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createMcpKeySchema }) input: CreateMcpKeyInput,
  ) {
    return this.auth.createKey(user.id, input.name, input.scopes);
  }

  @Delete(':id')
  @HttpCode(204)
  revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.auth.revokeKey(user.id, id);
  }
}
