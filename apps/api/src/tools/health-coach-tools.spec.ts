import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type {
  HealthService,
  TrainingService,
} from '@all-in-one/applets/health/api';
import { ToolKit } from '../mcp/mcp-tool-kit';
import { healthCoachTools } from './health-coach-tools';

describe('health coach MCP protocol', () => {
  it('advertises shared contract schemas and runs routines only for the token owner', async () => {
    const generate = vi.fn().mockResolvedValue({ id: 'saved' });
    const server = new McpServer({ name: 'test', version: '1' });
    const client = new Client({ name: 'test', version: '1' });
    healthCoachTools(
      new ToolKit(server, {
        token: 'test',
        clientId: 'test',
        scopes: ['health:read', 'health:write'],
        extra: { userId: 'owner' },
      }),
      {
        training: { generate } as unknown as TrainingService,
        health: {} as HealthService,
      },
    );
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    try {
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(14);
      expect(
        tools.tools.find((t) => t.name === 'generate_training_routine')
          ?.inputSchema.properties,
      ).toHaveProperty('equipment');
      const input = {
        title: 'خانه',
        goal: 'fitness',
        level: 'beginner',
        equipment: ['trx', 'bodyweight'],
        daysPerWeek: 3,
        weeks: 4,
        minutes: 30,
      };
      const result = await client.callTool({
        name: 'generate_training_routine',
        arguments: input,
      });
      expect(result.isError).not.toBe(true);
      expect(generate).toHaveBeenCalledWith('owner', input);
      await client.callTool({
        name: 'generate_training_routine',
        arguments: { ...input, equipment: ['invalid'] },
      });
      expect(generate).toHaveBeenCalledTimes(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
