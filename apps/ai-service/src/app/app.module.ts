import { Module } from '@nestjs/common';
import { AiRouterController } from './ai-router.controller';
import { AiRouterService } from './ai-router.service';

@Module({
  controllers: [AiRouterController],
  providers: [AiRouterService],
})
export class AppModule {}
