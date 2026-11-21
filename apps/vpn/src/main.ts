import { NestFactory } from '@nestjs/core';
import { StandardSchemaValidationPipe } from '@nestjs/common';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useSecurityHeaders();
  app.enableShutdownHooks();
  await app.listen(
    Number(process.env.VPN_PORT ?? 4390),
    process.env.VPN_HOST ?? '127.0.0.1',
  );
}

void bootstrap();
