import { NotFoundException } from '@nestjs/common';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { ToolKit } from './tool-kit';

type Handler = (
  args: unknown,
) => Promise<{ isError?: boolean; content: { text: string }[] }>;

function kit(scopes: string[]) {
  const tools = new Map<string, Handler>();
  const server = {
    registerTool: (name: string, _config: unknown, cb: Handler) =>
      tools.set(name, cb),
  } as unknown as McpServer;
  const k = new ToolKit(server, {
    token: 't',
    clientId: 'c',
    scopes,
    extra: { userId: 'u1' },
  });
  return { k, tools };
}

describe('ToolKit', () => {
  it('runs a tool for the token owner and returns JSON', async () => {
    const { k, tools } = kit(['planner:read']);
    k.tool(
      'who',
      { description: '', scope: 'planner:read', kind: 'read', input: {} },
      async () => ({ user: k.user }),
    );
    expect(await tools.get('who')?.({})).toEqual({
      content: [{ type: 'text', text: '{"user":"u1"}' }],
    });
  });

  it('refuses a tool outside the granted scopes', async () => {
    const { k, tools } = kit(['planner:read']);
    const run = vi.fn();
    k.tool(
      'make',
      { description: '', scope: 'planner:write', kind: 'create', input: {} },
      run,
    );
    const result = await tools.get('make')?.({});
    expect(result?.isError).toBe(true);
    expect(result?.content[0].text).toBe('Missing permission: planner:write');
    expect(run).not.toHaveBeenCalled();
  });

  it('turns service and validation errors into readable messages', async () => {
    const { k, tools } = kit(['cards:read']);
    k.tool(
      'missing',
      { description: '', scope: 'cards:read', kind: 'read', input: {} },
      async () => {
        throw new NotFoundException('این دسته پیدا نشد.');
      },
    );
    k.tool(
      'invalid',
      { description: '', scope: 'cards:read', kind: 'read', input: {} },
      async () => z.object({ name: z.string().min(1) }).parse({ name: '' }),
    );
    k.tool(
      'crash',
      { description: '', scope: 'cards:read', kind: 'read', input: {} },
      async () => {
        throw new Error('db password leaked here');
      },
    );
    expect((await tools.get('missing')?.({}))?.content[0].text).toBe(
      'این دسته پیدا نشد.',
    );
    expect((await tools.get('invalid')?.({}))?.content[0].text).toMatch(
      /^name: /,
    );
    expect((await tools.get('crash')?.({}))?.content[0].text).toBe(
      'Unable to complete the request.',
    );
  });
});
