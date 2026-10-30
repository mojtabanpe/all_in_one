/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { RECORDING_TYPES } from '@all-in-one/applets/english-learning/api';
import { config as zodConfig, locales } from 'zod/mini';
import { AppModule } from './app/app.module';
import { McpService } from './mcp/mcp.service';

// Persian validation messages (users see them in the RTL apps).
zodConfig(locales.fa());

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // English practice uploads a raw recording (audio/webm, …) for transcription.
  app.useBodyParser('raw', {
    type: Object.keys(RECORDING_TYPES),
    limit: '1500kb',
  });
  // ChatGPT (MCP + OAuth) routes use bearer tokens: mount them before the cookie CSRF check.
  app.get(McpService).mount(app.getHttpAdapter().getInstance());
  app.useSecurityHeaders();
  // Session cookie auth: reject cross-site state-changing requests.
  app.enableCsrfProtection();
  app.enableShutdownHooks();
  // Validates any @Body/@Query/@Param that declares a `schema` (Zod from @all-in-one/shared/schemas).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.API_PORT || 3333;
  await app.listen(port);
  // Set when Nx waits for this server to be ready
  if (process.env.NX_READY_SIGNAL_SOCKET) {
    try {
      // Function keeps TypeScript and bundlers from rewriting or bundling the import
      const load = new Function('s', 'return import(s)') as (
        s: string,
      ) => Promise<{ emitReadySignal(server: unknown): boolean }>;
      (await load('@nx/js/ready-signal')).emitReadySignal(app.getHttpServer());
    } catch {
      // @nx/js isn't installed
    }
  }
  Logger.log(
    `🚀 Application is running on: http://localhost:${port}/${globalPrefix}`,
  );
}

bootstrap();
