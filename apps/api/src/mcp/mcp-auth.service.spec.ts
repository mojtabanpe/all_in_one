import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '@all-in-one/api/db';
import type { Response } from 'express';
import { MCP_SCOPES } from '@all-in-one/shared/schemas';
import { McpAuthService } from './mcp-auth.service';

function service(env: Record<string, string> = {}) {
  const create = vi.fn().mockResolvedValue({});
  const pending = vi.fn().mockResolvedValue({});
  const prisma = {
    mcpClient: { create },
    mcpPending: { create: pending, deleteMany: vi.fn() },
    mcpCode: { deleteMany: vi.fn() },
    mcpCredential: { deleteMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue([]),
  } as unknown as PrismaService;
  const config = {
    get: (key: string) =>
      ({ NODE_ENV: 'production', MCP_PUBLIC_URL: 'https://x.ir', ...env })[key],
  } as unknown as ConfigService;
  return Object.assign(new McpAuthService(prisma, config), { pending });
}

const register = (auth: McpAuthService, uri: string) =>
  auth.clientsStore.registerClient({ redirect_uris: [uri] });

describe('MCP client registration', () => {
  it.each([
    'https://chatgpt.com/connector_platform_oauth_redirect',
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    'http://localhost:53122/callback',
    'http://127.0.0.1:8080/callback',
  ])('accepts %s', async (uri) => {
    await expect(register(service(), uri)).resolves.toMatchObject({
      redirect_uris: [uri],
    });
  });

  it.each([
    'https://evil.example/callback',
    'http://claude.ai/api/mcp/auth_callback',
    'https://claude.ai:8443/api/mcp/auth_callback',
    'https://claude.ai/api/mcp/auth_callback#x',
  ])('rejects %s', async (uri) => {
    await expect(register(service(), uri)).rejects.toThrow(/Redirect URI/);
  });

  it('adds extra hosts from MCP_REDIRECT_HOSTS', async () => {
    const auth = service({ MCP_REDIRECT_HOSTS: 'agent.example' });
    await expect(
      register(auth, 'https://agent.example/cb'),
    ).resolves.toBeDefined();
    await expect(
      register(auth, 'https://claude.ai/api/mcp/auth_callback'),
    ).resolves.toBeDefined();
  });
});

describe('MCP authorization request', () => {
  const res = () =>
    ({
      cookie: vi.fn(),
      setHeader: vi.fn(),
      type: vi.fn().mockReturnThis(),
      send: vi.fn(),
    }) as unknown as Response;
  const client = {
    client_id: '00000000-0000-0000-0000-000000000000',
    client_name: 'Claude',
    redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  };
  const params = (extra: object) => ({
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    codeChallenge: 'a'.repeat(43),
    ...extra,
  });
  const storedScopes = (auth: ReturnType<typeof service>) =>
    (auth.pending.mock.calls[0][0].data.params as { scopes: string[] }).scopes;

  it("ignores a client's own scope names (Claude's `claudeai`)", async () => {
    const auth = service();
    await auth.authorize(client, params({ scopes: ['claudeai'] }), res());
    expect(storedScopes(auth)).toEqual([...MCP_SCOPES]);
  });

  it('keeps the known scopes asked for', async () => {
    const auth = service();
    await auth.authorize(
      client,
      params({ scopes: ['planner:read', 'claudeai'] }),
      res(),
    );
    expect(storedScopes(auth)).toEqual(['planner:read']);
  });

  it('accepts the resource with a trailing slash', async () => {
    const auth = service();
    await expect(
      auth.authorize(
        client,
        params({ resource: new URL('https://x.ir/api/mcp/') }),
        res(),
      ),
    ).resolves.toBeUndefined();
  });
});
