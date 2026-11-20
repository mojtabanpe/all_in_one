import { requestLanguage } from '@all-in-one/api/ai';
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { resolve } from 'node:path';
/**
 * This is not a production server yet!
 * This is only a minimal backend to get started.
 */

import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { RECORDING_TYPES } from '@all-in-one/applets/english-learning/api';
import { APP_VERSION, APP_VERSION_HEADER } from '@all-in-one/shared/schemas';
import { config as zodConfig, locales } from 'zod/mini';
import { AppModule } from './app/app.module';
import { McpService } from './mcp/mcp.service';
import { TelegramService } from './telegram/telegram.service';

// Persian validation messages (users see them in the RTL apps).
zodConfig(locales.fa());

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const appVersion = process.env['APP_VERSION']?.trim() || APP_VERSION;
  app.use((request: Request, response: Response, next: NextFunction) => {
    response.setHeader(APP_VERSION_HEADER, appVersion);
    response.setHeader('Access-Control-Expose-Headers', APP_VERSION_HEADER);
    return requestLanguage.run(
      request.headers['accept-language']?.startsWith('en') ? 'en' : 'fa',
      next,
    );
  });
  // Behind nginx on the same host: client IPs (rate limits) come from X-Forwarded-For.
  app.set('trust proxy', 'loopback');
  // English practice uploads a raw recording (audio/webm, …) for transcription.
  app.useBodyParser('raw', {
    type: Object.keys(RECORDING_TYPES),
    limit: '1500kb',
  });
  // ChatGPT/Claude (MCP + OAuth) routes use bearer tokens: mount them before the cookie CSRF check.
  app.get(McpService).mount(app.getHttpAdapter().getInstance());
  // Telegram's webhook proves itself with its secret token header, not a session cookie.
  app.get(TelegramService).mount(app.getHttpAdapter().getInstance());
  // Public, read-only exercise clips. Persist data/exercise-videos across deployments.
  app.use(
    '/api/exercise-videos',
    express.static(resolve(process.cwd(), 'data/exercise-videos'), {
      fallthrough: false,
      immutable: true,
      maxAge: '1y',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
  app.useSecurityHeaders();
  // Session cookie auth: reject cross-site state-changing requests.
  app.enableCsrfProtection();
  app.enableShutdownHooks();
  // Validates any @Body/@Query/@Param that declares a `schema` (Zod from @all-in-one/shared/schemas).
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.API_PORT || 3333;
  // API_HOST=127.0.0.1 in production: only the reverse proxy reaches it.
  await app.listen(port, process.env.API_HOST || '0.0.0.0');
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
