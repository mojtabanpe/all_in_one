import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '@all-in-one/api/db';
import { McpAuthService } from './mcp-auth.service';

function service(env: Record<string, string> = {}) {
  const create = vi.fn().mockResolvedValue({});
  const prisma = { mcpClient: { create } } as unknown as PrismaService;
  const config = {
    get: (key: string) =>
      ({ NODE_ENV: 'production', MCP_PUBLIC_URL: 'https://x.ir', ...env })[key],
  } as unknown as ConfigService;
  return new McpAuthService(prisma, config);
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
