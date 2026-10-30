import { Module } from '@nestjs/common';
import { EnglishApiModule } from '@all-in-one/applets/english-learning/api';
import { PlannerApiModule } from '@all-in-one/applets/planner/api';
import { McpAuthService } from './mcp-auth.service';
import { McpKeysController } from './mcp.controller';
import { McpService } from './mcp.service';

/** ChatGPT connection: OAuth + personal tokens + English and planner tools. */
@Module({
  imports: [EnglishApiModule, PlannerApiModule],
  providers: [McpAuthService, McpService],
  controllers: [McpKeysController],
})
export class McpModule {}
