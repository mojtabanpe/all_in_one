import { Module } from '@nestjs/common';
import { ToolsModule } from '../tools/tools.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

/** In-app AI assistant (user's own model + the shared tools). */
@Module({
  imports: [ToolsModule],
  providers: [AssistantService],
  controllers: [AssistantController],
})
export class AssistantModule {}
