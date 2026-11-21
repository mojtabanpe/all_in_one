import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Put,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import * as z from 'zod/mini';
import { AppService } from './app.service';

const idSchema = z.uuid();
const entitlementSchema = z.nullable(
  z.object({
    cycle: z.uuid(),
    quotaBytes: z.int().check(z.positive()),
    expiresAt: z.int().check(z.positive()),
  }),
);
const requestSchema = z.object({ entitlement: entitlementSchema });
export type Entitlement = z.infer<typeof entitlementSchema>;

const digest = (value: string) => createHash('sha256').update(value).digest();

@Controller()
export class AppController {
  constructor(private readonly vpn: AppService) {}

  @Get('health')
  health() {
    return { status: 'ok' };
  }

  @Put('v1/accounts/:id')
  @Header('Cache-Control', 'no-store')
  async account(
    @Headers('authorization') authorization: string | undefined,
    @Param('id', { schema: idSchema }) id: string,
    @Body({ schema: requestSchema }) body: z.infer<typeof requestSchema>,
  ) {
    if (
      !authorization ||
      !timingSafeEqual(digest(authorization), this.vpn.authorization)
    ) {
      throw new UnauthorizedException();
    }
    return { access: await this.vpn.reconcile(id, body.entitlement) };
  }
}
