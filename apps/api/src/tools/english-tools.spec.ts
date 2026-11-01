import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type {
  CardsService,
  DecksService,
  EnglishAiService,
  TextsService,
} from '@all-in-one/applets/english-learning/api';
import { ToolKit } from '../mcp/mcp-tool-kit';
import { englishTools } from './english-tools';

describe('Shadowing MCP tool', () => {
  it('validates the exercise and uses only the authenticated user’s AI', async () => {
    const dialogue = vi.fn().mockResolvedValue({ title: 'Coffee', lines: [] });
    const server = new McpServer({ name: 'test', version: '1' });
    const client = new Client({ name: 'test', version: '1' });
    englishTools(
      new ToolKit(server, {
        token: 'test',
        clientId: 'test',
        scopes: ['readings:write'],
        extra: { userId: 'owner' },
      }),
      {
        decks: {} as DecksService,
        cards: {} as CardsService,
        texts: {} as TextsService,
        ai: { dialogue } as unknown as EnglishAiService,
      },
    );
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    await client.connect(b);
    try {
      const tools = await client.listTools();
      expect(
        tools.tools.find((t) => t.name === 'generate_shadowing_practice'),
      ).toBeTruthy();
      const result = await client.callTool({
        name: 'generate_shadowing_practice',
        arguments: { situation: 'small-talk', level: 'B1' },
      });
      expect(result.isError).not.toBe(true);
      expect(dialogue).toHaveBeenCalledWith('owner', 'small-talk', 'B1');
      const invalid = await client.callTool({
        name: 'generate_shadowing_practice',
        arguments: { situation: 'invalid' },
      });
      expect(invalid.isError).toBe(true);
      expect(dialogue).toHaveBeenCalledTimes(1);
    } finally {
      await client.close();
      await server.close();
    }
  });
});
