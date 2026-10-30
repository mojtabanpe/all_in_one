import { Module } from '@nestjs/common';
import { ToolsModule } from '../tools/tools.module';
import { McpAuthService } from './mcp-auth.service';
import { McpKeysController } from './mcp.controller';
import { McpService } from './mcp.service';

/** ChatGPT connection: OAuth + personal tokens + English, planner and health tools. */
@Module({
  imports: [ToolsModule],
  providers: [McpAuthService, McpService],
  controllers: [McpKeysController],
})
export class McpModule {}
