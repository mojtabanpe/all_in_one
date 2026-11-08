import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as z from 'zod/mini';
import type { BillingStore } from '@all-in-one/shared/schemas';

const BAZAAR_ORIGIN = 'https://pardakht.cafebazaar.ir/devapi/v2';
const MYKET_ORIGIN = 'https://developer.myket.ir/api/partners/applications';
/** The Android shell's application ID; the same in every store build. */
const DEFAULT_PACKAGE = 'ir.poshtetgarm.poshtetgarm_hybrid';

/** Both stores answer with the Google Play v3 product purchase shape. */
const purchaseSchema = z.object({
  purchaseState: z.coerce.number(),
  developerPayload: z.optional(z.nullable(z.string())),
  purchaseTime: z.optional(z.nullable(z.coerce.number())),
});
const tokenSchema = z.object({
  access_token: z.string().check(z.minLength(1)),
  expires_in: z.optional(z.coerce.number()),
});

export type StorePurchase =
  | { kind: 'purchased'; payload: string | null; purchaseTime: number | null }
  | { kind: 'invalid' };

const unavailable = () =>
  new ServiceUnavailableException('Store billing is unavailable');

/**
 * Transport only: asks a store's developer API whether a purchase token is a completed purchase of a product.
 * Billing must bind it to an account and activate atomically. Store credentials stay in server secrets and never
 * reach logs, errors or responses; any failure that is not the purchase's fault is a 503, so nothing activates.
 */
@Injectable()
export class StoreGateway {
  private bazaarToken?: { value: string; until: number };

  constructor(private readonly config: ConfigService) {}

  private get packageName(): string {
    return (
      this.config.get<string>('BILLING_ANDROID_PACKAGE')?.trim() ||
      DEFAULT_PACKAGE
    );
  }

  async verify(
    store: BillingStore,
    sku: string,
    purchaseToken: string,
  ): Promise<StorePurchase> {
    const response =
      store === 'bazaar'
        ? await this.bazaar(sku, purchaseToken)
        : await this.myket(sku, purchaseToken);
    // A token the store does not know for this package and product: forged, wrong SKU or another app's.
    if ([400, 404].includes(response.status)) return { kind: 'invalid' };
    if (!response.ok) throw unavailable();
    let data: z.infer<typeof purchaseSchema>;
    try {
      data = purchaseSchema.parse(await response.json());
    } catch {
      throw unavailable();
    }
    // 0 is purchased; 1 is a failed (Myket) or refunded (Bazaar) purchase.
    if (data.purchaseState !== 0) return { kind: 'invalid' };
    return {
      kind: 'purchased',
      payload: data.developerPayload ?? null,
      purchaseTime: data.purchaseTime ?? null,
    };
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
    } catch {
      throw unavailable();
    }
  }

  /**
   * Cafe Bazaar Pardakht API v2. A Pishkhan API key (`BAZAAR_API_SECRET`) is used when set; otherwise an OAuth
   * client (`BAZAAR_CLIENT_ID`, `BAZAAR_CLIENT_SECRET`, `BAZAAR_REFRESH_TOKEN`) whose access token is refreshed
   * when it expires or is refused.
   */
  private async bazaar(sku: string, token: string): Promise<Response> {
    const url = `${BAZAAR_ORIGIN}/api/validate/${encodeURIComponent(this.packageName)}/inapp/${encodeURIComponent(sku)}/purchases/${encodeURIComponent(token)}/`;
    const secret = this.config.get<string>('BAZAAR_API_SECRET')?.trim();
    if (secret)
      return this.send(url, {
        headers: {
          'CAFEBAZAAR-PISHKHAN-API-SECRET': secret,
          Accept: 'application/json',
        },
      });
    const attempt = async (refresh: boolean) =>
      this.send(url, {
        headers: {
          Authorization: `Bearer ${await this.bazaarAccessToken(refresh)}`,
          Accept: 'application/json',
        },
      });
    const response = await attempt(false);
    return [401, 403].includes(response.status) ? attempt(true) : response;
  }

  private async bazaarAccessToken(refresh: boolean): Promise<string> {
    if (!refresh && this.bazaarToken && this.bazaarToken.until > Date.now())
      return this.bazaarToken.value;
    const id = this.config.get<string>('BAZAAR_CLIENT_ID')?.trim();
    const secret = this.config.get<string>('BAZAAR_CLIENT_SECRET')?.trim();
    const refreshToken = this.config
      .get<string>('BAZAAR_REFRESH_TOKEN')
      ?.trim();
    if (!id || !secret || !refreshToken)
      throw new ServiceUnavailableException('Store billing is not configured');
    const response = await this.send(`${BAZAAR_ORIGIN}/auth/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: id,
        client_secret: secret,
        refresh_token: refreshToken,
      }),
    });
    if (!response.ok) throw unavailable();
    let data: z.infer<typeof tokenSchema>;
    try {
      data = tokenSchema.parse(await response.json());
    } catch {
      throw unavailable();
    }
    // Renewed a minute early so a request never carries a token that expires on the way.
    const seconds = Math.max(60, data.expires_in ?? 3600) - 60;
    this.bazaarToken = {
      value: data.access_token,
      until: Date.now() + seconds * 1000,
    };
    return data.access_token;
  }

  /** Myket server-to-server validation with the panel's verification token (`MYKET_ACCESS_TOKEN`). */
  private async myket(sku: string, token: string): Promise<Response> {
    const access = this.config.get<string>('MYKET_ACCESS_TOKEN')?.trim();
    if (!access)
      throw new ServiceUnavailableException('Store billing is not configured');
    return this.send(
      `${MYKET_ORIGIN}/${encodeURIComponent(this.packageName)}/purchases/products/${encodeURIComponent(sku)}/verify`,
      {
        method: 'POST',
        headers: {
          'X-Access-Token': access,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ tokenId: token }),
      },
    );
  }
}
