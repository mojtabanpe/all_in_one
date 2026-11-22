import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useSecurityHeaders();
  app.enableShutdownHooks();

  const port = Number(process.env.AI_SERVICE_PORT ?? 4395);
  const host = process.env.AI_SERVICE_HOST ?? '127.0.0.1';
  await app.listen(port, host);
  Logger.log(
    `ai-service listening on http://${host}:${port} (selfHosted=${process.env.AI_SELF_HOSTED_ENABLED === 'true'}, mode=${process.env.AI_SELF_HOSTED_MODE ?? 'fallback'})`,
    'Bootstrap',
  );
}

void bootstrap();
