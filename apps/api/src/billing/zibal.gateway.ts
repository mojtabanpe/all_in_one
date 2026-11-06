import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as z from 'zod/mini';

const ORIGIN = 'https://gateway.zibal.ir';
const responseSchema = z.object({
  result: z.number().check(z.int()),
  trackId: z.optional(
    z.number().check(z.int(), z.positive(), z.maximum(Number.MAX_SAFE_INTEGER)),
  ),
  amount: z.optional(
    z.number().check(z.int(), z.positive(), z.maximum(Number.MAX_SAFE_INTEGER)),
  ),
  status: z.optional(z.number().check(z.int())),
  orderId: z.optional(z.string()),
  refNumber: z.optional(z.union([z.string(), z.number()])),
});

/** Transport only. Billing must bind trackId to an owned order and activate atomically. */
@Injectable()
export class ZibalGateway {
  constructor(private readonly config: ConfigService) {}

  private merchant(): string {
    if (this.config.get<string>('ZIBAL_SANDBOX') === 'true') return 'zibal';
    const merchant = this.config.get<string>('ZIBAL_MERCHANT')?.trim();
    if (!merchant || merchant === 'zibal')
      throw new ServiceUnavailableException(
        'Payment gateway is not configured',
      );
    return merchant;
  }

  private amount(value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0)
      throw new BadGatewayException('Invalid payment amount');
  }

  private async post(
    path: 'request' | 'verify',
    payload: Record<string, unknown>,
  ) {
    const merchant = this.merchant();
    try {
      const response = await fetch(`${ORIGIN}/v1/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, merchant }),
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });
      if (!response.ok) throw new Error('Gateway HTTP failure');
      return responseSchema.parse(await response.json());
    } catch {
      // Provider bodies/errors can include secrets; never forward or log them.
      throw new ServiceUnavailableException('Payment gateway is unavailable');
    }
  }

  async request(orderId: string, amountRial: number) {
    this.amount(amountRial);
    if (!orderId || orderId.length > 128)
      throw new BadGatewayException('Invalid payment order');
    const callback = this.config.get<string>('ZIBAL_CALLBACK_URL');
    if (!callback)
      throw new ServiceUnavailableException(
        'Payment callback is not configured',
      );
    const url = new URL(callback);
    const sandbox = this.config.get<string>('ZIBAL_SANDBOX') === 'true';
    if (
      url.username ||
      url.password ||
      url.hash ||
      (url.protocol !== 'https:' &&
        !(
          sandbox &&
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1'].includes(url.hostname)
        ))
    ) {
      throw new ServiceUnavailableException('Payment callback is invalid');
    }
    const data = await this.post('request', {
      orderId,
      amount: amountRial,
      callbackUrl: callback,
      description: `Poshtetgarm ${orderId}`,
    });
    if (data.result !== 100 || !data.trackId)
      throw new BadGatewayException('Payment request was rejected');
    return {
      trackId: String(data.trackId),
      paymentUrl: `${ORIGIN}/start/${data.trackId}`,
    };
  }

  async verify(trackId: string, amountRial: number, orderId: string) {
    this.amount(amountRial);
    if (
      !/^\d+$/.test(trackId) ||
      !Number.isSafeInteger(Number(trackId)) ||
      Number(trackId) <= 0
    )
      throw new BadGatewayException('Invalid payment reference');
    const data = await this.post('verify', { trackId: Number(trackId) });
    if (
      ![100, 201].includes(data.result) ||
      ![1, 2].includes(data.status ?? -1) ||
      data.amount !== amountRial ||
      (data.orderId !== undefined && data.orderId !== orderId)
    ) {
      throw new BadGatewayException('Payment could not be verified');
    }
    // Already-verified is distinct: callers must never grant access twice.
    return {
      kind:
        data.result === 100
          ? ('verified' as const)
          : ('already_verified' as const),
      refNumber: data.refNumber === undefined ? null : String(data.refNumber),
    };
  }
}
