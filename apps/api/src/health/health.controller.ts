import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { Health } from '@all-in-one/shared/schemas';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<Health> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      } satisfies Health);
    }
    return { status: 'ok', database: 'up' };
  }
}
