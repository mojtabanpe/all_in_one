import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AuthorizationParams,
  OAuthServerProvider,
} from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import {
  InvalidClientMetadataError,
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError,
  InvalidTokenError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { digest } from '@all-in-one/api/auth';
import { type Prisma, PrismaService } from '@all-in-one/api/db';
import {
  MCP_SCOPES,
  type McpKeyInfo,
  type McpScope,
} from '@all-in-one/shared/schemas';
import { consentPage } from './mcp-pages';

const secret = () => randomBytes(32).toString('base64url');
export const TOKEN_PREFIX = 'aio_mcp_';

const KEY_LIFETIME = 90 * 86_400_000;
const PENDING_LIFETIME = 10 * 60_000;
const CODE_LIFETIME = 5 * 60_000;
const ACCESS_LIFETIME = 60 * 60_000;
const REFRESH_LIFETIME = 30 * 86_400_000;

interface Grant {
  keyId: string;
  clientId: string;
  params: AuthorizationParams;
}

/** Stored authorization params (URLs as strings). */
type StoredParams = Omit<AuthorizationParams, 'resource'> & {
  resource: string;
};

const asParams = (json: Prisma.JsonValue): AuthorizationParams => {
  const p = json as unknown as StoredParams;
  return { ...p, resource: p.resource ? new URL(p.resource) : undefined };
};

/**
 * OAuth for the ChatGPT connection (Recall's flow): dynamic client
 * registration, S256 PKCE, a consent page where the user pastes a personal
 * token, one-use codes, 1-hour access and rotating 30-day refresh tokens.
 * Only SHA-256 hashes of every secret are stored.
 */
@Injectable()
export class McpAuthService implements OAuthServerProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get production() {
    return this.config.get('NODE_ENV') === 'production';
  }

  /** Public origin of the api, e.g. https://poshtetgarm.ir (never the Host header). */
  get origin(): string {
    const url = new URL(
      this.config.get<string>('MCP_PUBLIC_URL') ||
        `http://localhost:${this.config.get('API_PORT') ?? 3333}`,
    );
    const local = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && !this.production))
      throw new Error('MCP_PUBLIC_URL must use HTTPS.');
    return url.origin;
  }

  get resource(): URL {
    return new URL('/api/mcp', this.origin);
  }

  /** Where users manage tokens: the customer app's account page. */
  get accountUrl(): string {
    const app =
      this.config.get<string>('APP_PUBLIC_URL') ||
      (this.config.get<string>('APP_ORIGINS') || 'http://localhost:4400').split(
        ',',
      )[0];
    return new URL('account', app.trim().replace(/\/+$/, '') + '/').href;
  }

  private resourceCheck(resource?: URL) {
    if (resource && resource.href !== this.resource.href)
      throw new InvalidTargetError('Token audience must be this MCP endpoint.');
  }

  private scopesCheck(scopes: string[]) {
    if (!scopes.every((s) => (MCP_SCOPES as readonly string[]).includes(s)))
      throw new InvalidScopeError('Unsupported permission.');
  }

  readonly clientsStore = {
    getClient: async (
      id: string,
    ): Promise<OAuthClientInformationFull | undefined> => {
      if (!/^[0-9a-f-]{36}$/i.test(id)) return undefined;
      const row = await this.prisma.mcpClient.findUnique({ where: { id } });
      return row?.metadata as unknown as OAuthClientInformationFull | undefined;
    },
    registerClient: async (
      client: Omit<
        OAuthClientInformationFull,
        'client_id' | 'client_id_issued_at'
      >,
    ): Promise<OAuthClientInformationFull> => {
      const hosts = (
        this.config.get<string>('MCP_REDIRECT_HOSTS') ||
        'chatgpt.com,chat.openai.com'
      )
        .split(',')
        .map((h) => h.trim());
      const allowed = (uri: string) => {
        const u = new URL(uri);
        return (
          !u.hash &&
          !u.username &&
          !u.password &&
          ((u.protocol === 'https:' && !u.port && hosts.includes(u.hostname)) ||
            (!this.production &&
              u.protocol === 'http:' &&
              u.hostname === '127.0.0.1'))
        );
      };
      if (
        !client.redirect_uris.length ||
        client.redirect_uris.length > 10 ||
        !client.redirect_uris.every((uri) => allowed(String(uri)))
      )
        throw new InvalidClientMetadataError(
          'Redirect URI must belong to an allowed ChatGPT host.',
        );
      const full: OAuthClientInformationFull = {
        ...client,
        client_id: randomUUID(),
        client_id_issued_at: Math.floor(Date.now() / 1000),
      };
      await this.prisma.mcpClient.create({
        data: {
          id: full.client_id,
          metadata: JSON.parse(JSON.stringify(full)) as Prisma.InputJsonValue,
        },
      });
      return full;
    },
  };

  // ---------------------------------------------------------------- personal tokens

  async createKey(
    userId: string,
    name: string,
    scopes: readonly McpScope[] = MCP_SCOPES,
  ): Promise<McpKeyInfo & { token: string }> {
    this.scopesCheck([...scopes]);
    if ((await this.prisma.mcpKey.count({ where: { userId } })) >= 20)
      throw new BadRequestException('حداکثر ۲۰ کلید؛ یکی را باطل کن.');
    const token = TOKEN_PREFIX + secret();
    const key = await this.prisma.mcpKey.create({
      data: {
        userId,
        name,
        tokenHash: digest(token),
        scopes: [...scopes],
        expiresAt: new Date(Date.now() + KEY_LIFETIME),
      },
    });
    return { ...toKeyInfo(key), token };
  }

  async listKeys(userId: string): Promise<McpKeyInfo[]> {
    const keys = await this.prisma.mcpKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return keys.map(toKeyInfo);
  }

  /** Revoking a key also ends every OAuth grant made with it (cascade). */
  async revokeKey(userId: string, id: string): Promise<void> {
    await this.prisma.mcpKey.deleteMany({ where: { id, userId } });
  }

  private key(token: string) {
    return this.prisma.mcpKey.findFirst({
      where: { tokenHash: digest(token), expiresAt: { gt: new Date() } },
    });
  }

  // ---------------------------------------------------------------- OAuth

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    this.resourceCheck(params.resource);
    const scopes = params.scopes?.length ? params.scopes : [...MCP_SCOPES];
    this.scopesCheck(scopes);
    if (!/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge))
      throw new InvalidGrantError('Invalid PKCE challenge.');
    const request = secret();
    const csrf = secret();
    const now = new Date();
    // Expired transient state never grants access; clear it as we go.
    await this.prisma.$transaction([
      this.prisma.mcpPending.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.prisma.mcpCode.deleteMany({ where: { expiresAt: { lte: now } } }),
      this.prisma.mcpCredential.deleteMany({
        where: { refreshExpires: { lte: now } },
      }),
    ]);
    const stored: StoredParams = {
      ...params,
      resource: this.resource.href,
      scopes,
    };
    await this.prisma.mcpPending.create({
      data: {
        id: digest(request),
        clientId: client.client_id,
        params: JSON.parse(JSON.stringify(stored)) as Prisma.InputJsonValue,
        csrfHash: digest(csrf),
        expiresAt: new Date(Date.now() + PENDING_LIFETIME),
      },
    });
    res.cookie('aio_mcp_consent', csrf, {
      httpOnly: true,
      secure: this.origin.startsWith('https:'),
      sameSite: 'lax',
      path: '/api/mcp/consent',
      maxAge: PENDING_LIFETIME,
    });
    consentPage(res, {
      request,
      client: client.client_name || 'ChatGPT',
      scopes,
      redirectUri: params.redirectUri,
      accountUrl: this.accountUrl,
    });
  }

  /** The consent form: a valid personal token turns the request into a one-use code. */
  async consent(
    request: string,
    csrf: string,
    token: string,
    res: Response,
  ): Promise<void> {
    const key = await this.key(token);
    if (!key)
      throw new InvalidTokenError(
        'کلید شخصی نادرست است یا منقضی شده. در صفحه حساب کلید تازه بساز و دوباره وصل شو.',
      );
    const code = secret();
    const params = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.mcpPending.findFirst({
        where: {
          id: digest(request),
          csrfHash: digest(csrf),
          expiresAt: { gt: new Date() },
        },
      });
      if (!pending)
        throw new InvalidGrantError(
          'این درخواست اتصال منقضی شده. از ChatGPT دوباره شروع کن.',
        );
      const p = asParams(pending.params);
      if (!(p.scopes ?? []).every((s) => key.scopes.includes(s)))
        throw new InvalidScopeError(
          'این کلید همه دسترسی‌های خواسته‌شده را ندارد.',
        );
      const used = await tx.mcpPending.deleteMany({
        where: { id: pending.id },
      });
      if (!used.count)
        throw new InvalidGrantError('این درخواست قبلاً استفاده شده.');
      await tx.mcpCode.create({
        data: {
          codeHash: digest(code),
          keyId: key.id,
          clientId: pending.clientId,
          params: pending.params as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + CODE_LIFETIME),
        },
      });
      return p;
    });
    res.clearCookie('aio_mcp_consent', { path: '/api/mcp/consent' });
    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set('code', code);
    if (params.state) redirect.searchParams.set('state', params.state);
    res.redirect(303, redirect.href);
  }

  private async code(
    client: OAuthClientInformationFull,
    code: string,
  ): Promise<Grant> {
    const row = await this.prisma.mcpCode.findFirst({
      where: {
        codeHash: digest(code),
        clientId: client.client_id,
        expiresAt: { gt: new Date() },
      },
    });
    if (!row)
      throw new InvalidGrantError('Invalid or expired authorization code.');
    return {
      keyId: row.keyId,
      clientId: row.clientId,
      params: asParams(row.params),
    };
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
  ) {
    return (await this.code(client, code)).params.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _verifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.resourceCheck(resource);
    const grant = await this.code(client, code);
    if (redirectUri !== grant.params.redirectUri)
      throw new InvalidGrantError('Redirect URI does not match.');
    return this.prisma.$transaction(async (tx) => {
      const used = await tx.mcpCode.deleteMany({
        where: {
          codeHash: digest(code),
          clientId: client.client_id,
          expiresAt: { gt: new Date() },
        },
      });
      if (!used.count)
        throw new InvalidGrantError('Authorization code already used.');
      return this.issue(
        tx,
        grant.keyId,
        client.client_id,
        grant.params.scopes ?? [],
      );
    });
  }

  private async issue(
    tx: Prisma.TransactionClient,
    keyId: string,
    clientId: string,
    scopes: string[],
  ): Promise<OAuthTokens> {
    const valid = await tx.mcpKey.count({
      where: { id: keyId, expiresAt: { gt: new Date() } },
    });
    if (!valid)
      throw new InvalidGrantError('Personal token revoked or expired.');
    const access = secret();
    const refresh = secret();
    await tx.mcpCredential.create({
      data: {
        tokenHash: digest(access),
        refreshHash: digest(refresh),
        keyId,
        clientId,
        scopes,
        accessExpires: new Date(Date.now() + ACCESS_LIFETIME),
        refreshExpires: new Date(Date.now() + REFRESH_LIFETIME),
      },
    });
    return {
      access_token: access,
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: ACCESS_LIFETIME / 1000,
      scope: scopes.join(' '),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refresh: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    this.resourceCheck(resource);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.mcpCredential.findFirst({
        where: {
          refreshHash: digest(refresh),
          clientId: client.client_id,
          refreshExpires: { gt: new Date() },
        },
      });
      if (!row)
        throw new InvalidGrantError('Invalid or expired refresh token.');
      if (scopes && !scopes.every((s) => row.scopes.includes(s)))
        throw new InvalidScopeError(
          'Cannot expand permissions during refresh.',
        );
      // Rotation: the old pair is gone even if two refreshes race.
      const used = await tx.mcpCredential.deleteMany({
        where: { refreshHash: row.refreshHash },
      });
      if (!used.count)
        throw new InvalidGrantError('Refresh token already used.');
      return this.issue(tx, row.keyId, row.clientId, scopes ?? row.scopes);
    });
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    if (token.startsWith(TOKEN_PREFIX)) {
      const key = await this.key(token);
      if (!key) throw new InvalidTokenError('Invalid personal token.');
      return {
        token,
        clientId: 'personal',
        scopes: key.scopes,
        expiresAt: Math.floor(key.expiresAt.getTime() / 1000),
        resource: this.resource,
        extra: { userId: key.userId },
      };
    }
    const now = new Date();
    const row = await this.prisma.mcpCredential.findFirst({
      where: {
        tokenHash: digest(token),
        accessExpires: { gt: now },
        key: { expiresAt: { gt: now } },
      },
      include: { key: { select: { userId: true } } },
    });
    if (!row) throw new InvalidTokenError('Invalid or expired access token.');
    return {
      token,
      clientId: row.clientId,
      scopes: row.scopes,
      expiresAt: Math.floor(row.accessExpires.getTime() / 1000),
      resource: this.resource,
      extra: { userId: row.key.userId },
    };
  }

  async revokeToken(
    client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    const hash = digest(request.token);
    await this.prisma.mcpCredential.deleteMany({
      where: {
        clientId: client.client_id,
        OR: [{ tokenHash: hash }, { refreshHash: hash }],
      },
    });
  }
}

function toKeyInfo(k: {
  id: string;
  name: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date;
}): McpKeyInfo {
  return {
    id: k.id,
    name: k.name,
    scopes: k.scopes as McpScope[],
    createdAt: k.createdAt.toISOString(),
    expiresAt: k.expiresAt.toISOString(),
  };
}
