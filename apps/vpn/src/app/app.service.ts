import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Entitlement } from './app.controller';

interface PanelClient {
  client: {
    uuid: string;
    comment: string;
    enable: boolean;
    expiryTime: number;
    totalGB: number;
  };
  inboundIds: number[];
  usedTraffic: number;
}

function readHttpsUrl(value: string | undefined, name: string) {
  const url = new URL(value ?? '');
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `${name} must be an HTTPS URL without user info, query or fragment`,
    );
  }
  return url;
}

function readSecret(name: string) {
  const value = process.env[name];
  if (!value || value.length < 24) throw new Error(`${name} is required`);
  return value;
}

@Injectable()
export class AppService {
  readonly authorization = createHash('sha256')
    .update(`Bearer ${readSecret('VPN_SERVICE_TOKEN')}`)
    .digest();
  private readonly panel = readHttpsUrl(
    process.env.VPN_PANEL_URL,
    'VPN_PANEL_URL',
  );
  private readonly panelToken = readSecret('VPN_PANEL_TOKEN');
  private readonly inboundId = Number(process.env.VPN_INBOUND_ID);
  private readonly endpoint = readHttpsUrl(
    process.env.VPN_CLIENT_ENDPOINT,
    'VPN_CLIENT_ENDPOINT',
  );
  private readonly pending = new Map<string, Promise<unknown>>();

  constructor() {
    if (!Number.isSafeInteger(this.inboundId) || this.inboundId < 1) {
      throw new Error('VPN_INBOUND_ID must be a positive integer');
    }
    if (this.endpoint.pathname !== '/') {
      throw new Error('VPN_CLIENT_ENDPOINT must specify the tunnel origin');
    }
  }

  async reconcile(id: string, entitlement: Entitlement) {
    const current = this.pending.get(id);
    const operation = (
      current?.catch(() => undefined) ?? Promise.resolve()
    ).then(() => this.apply(id, entitlement));
    this.pending.set(id, operation);
    try {
      return await operation;
    } catch {
      throw new ServiceUnavailableException('VPN panel unavailable');
    } finally {
      if (this.pending.get(id) === operation) this.pending.delete(id);
    }
  }

  private async apply(id: string, entitlement: Entitlement) {
    const name = `poshtetgarm-vpn-${id}`;
    const before = await this.request<PanelClient>(
      `get/${name}`,
      undefined,
      true,
    );
    if (
      before &&
      (before.inboundIds.length !== 1 ||
        before.inboundIds[0] !== this.inboundId)
    ) {
      throw new Error('Unexpected VPN inbound');
    }
    if (!entitlement || entitlement.expiresAt <= Date.now()) {
      if (before?.client.enable)
        await this.request(`update/${name}`, { enable: false });
      return null;
    }

    const usage = before?.usedTraffic ?? 0;
    const [cycle, baselineText] = before?.client.comment?.split(':') ?? [];
    const baseline = cycle === entitlement.cycle ? Number(baselineText) : usage;
    const ceiling = baseline + entitlement.quotaBytes;
    if (
      !Number.isSafeInteger(usage) ||
      usage < 0 ||
      !Number.isSafeInteger(baseline) ||
      baseline < 0 ||
      !Number.isSafeInteger(ceiling)
    ) {
      throw new Error('Invalid traffic counters');
    }
    const client = {
      email: name,
      totalGB: ceiling,
      expiryTime: entitlement.expiresAt,
      enable: usage < ceiling,
      comment: `${entitlement.cycle}:${baseline}`,
    };
    if (!before) {
      await this.request('add', {
        client: {
          ...client,
          id: randomUUID(),
          subId: randomBytes(18).toString('hex'),
        },
        inboundIds: [this.inboundId],
      });
    } else if (
      before.client.totalGB !== ceiling ||
      before.client.expiryTime !== client.expiryTime ||
      before.client.enable !== client.enable ||
      before.client.comment !== client.comment
    ) {
      await this.request(`update/${name}`, client);
    }

    const after = await this.request<PanelClient>(`get/${name}`);
    if (
      !after ||
      after.client.totalGB !== ceiling ||
      after.client.expiryTime !== client.expiryTime ||
      after.client.comment !== client.comment ||
      !Number.isSafeInteger(after.usedTraffic) ||
      after.usedTraffic < 0
    ) {
      throw new Error('Panel did not confirm VPN configuration');
    }
    const remainingBytes = Math.max(0, ceiling - after.usedTraffic);
    return {
      expiresAt: client.expiryTime,
      quotaBytes: entitlement.quotaBytes,
      remainingBytes,
      link:
        after.client.enable && remainingBytes > 0
          ? await this.link(name, after.client.uuid)
          : null,
    };
  }

  private async link(name: string, id: string) {
    const links = await this.request<string[]>(`links/${name}`);
    const match = links?.find((link) => link.startsWith(`vless://${id}@`));
    if (!match) throw new Error('Missing VLESS link');
    const link = new URL(match);
    if (
      link.searchParams.get('security') === 'tls' &&
      !link.searchParams.get('sni')
    ) {
      link.searchParams.set('sni', link.hostname);
    }
    link.hostname = this.endpoint.hostname;
    link.port = this.endpoint.port || '443';
    link.hash = 'Poshtetgarm';
    return link.href;
  }

  private async request<T>(
    path: string,
    body?: object,
    allowMissing = false,
  ): Promise<T | null> {
    const base = this.panel.href.replace(/\/$/, '');
    const response = await fetch(`${base}/panel/api/clients/${path}`, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${this.panelToken}`,
        'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
    });
    if (!response.ok) throw new Error('VPN panel HTTP failure');
    const payload: { success: boolean; msg?: string; obj: T } =
      await response.json();
    if (
      allowMissing &&
      !payload.success &&
      /client not found|record not found/i.test(payload.msg ?? '')
    ) {
      return null;
    }
    if (!payload.success) throw new Error('VPN panel rejected the request');
    return payload.obj;
  }
}
