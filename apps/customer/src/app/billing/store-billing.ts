import { firstValueFrom } from 'rxjs';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  BillingReturnStatus,
  BillingStore,
  BillingStoreIntent,
} from '@all-in-one/shared/schemas';
import { API_BASE_URL } from '@all-in-one/web/shared';

/** A purchase the store finished: verified by our server before it is consumed. */
interface StorePurchase {
  sku: string;
  purchaseToken: string;
}
declare global {
  interface Window {
    /** Injected by the Android store builds (Cafe Bazaar, Myket) into the main frame of poshtetgarm.ir. */
    PoshtetgarmStore?: {
      request(method: string, args?: Record<string, unknown>): Promise<unknown>;
    };
  }
}

/** The store build's user agent ends with `PoshtetgarmStore/bazaar` or `PoshtetgarmStore/myket`. */
export function storeFromUserAgent(agent: string): BillingStore | null {
  const match = /\bPoshtetgarmStore\/(bazaar|myket)\b/.exec(agent);
  return match ? (match[1] as BillingStore) : null;
}

/** The shell answers with codes; the page shows these (translated like the rest of the app). */
const STORE_ERRORS: Record<string, string> = {
  unavailable:
    'فروشگاه در دسترس نیست. برنامهٔ فروشگاه را نصب کن، وارد حسابت شو و دوباره امتحان کن.',
  failed:
    'خرید در فروشگاه انجام نشد. اگر مبلغی کم شده، چند دقیقه بعد دوباره همین صفحه را باز کن.',
};
const NOT_CONNECTED = 'اتصال به فروشگاه برقرار نشد.';

/** The store's purchase sheet was closed without paying. */
export class StorePurchaseCanceled extends Error {}

/**
 * In-app billing of the Android store builds. Both stores forbid any other payment route in their builds, so
 * the billing page uses this instead of Zibal there. The server checks each purchase with the store before
 * granting time; a purchase is consumed only after that, so one that failed to reach us is sent again later.
 */
@Injectable({ providedIn: 'root' })
export class StoreBilling {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  readonly store: BillingStore | null =
    typeof navigator === 'undefined'
      ? null
      : storeFromUserAgent(navigator.userAgent);

  private bridge(): Promise<NonNullable<Window['PoshtetgarmStore']>> {
    const ready = window.PoshtetgarmStore;
    if (ready) return Promise.resolve(ready);
    // The shell injects the bridge when the page has loaded, which can be after the app starts.
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(NOT_CONNECTED)), 15_000);
      window.addEventListener(
        'poshtetgarm-store-ready',
        () => {
          clearTimeout(timer);
          if (window.PoshtetgarmStore) resolve(window.PoshtetgarmStore);
        },
        { once: true },
      );
    });
  }

  private async request<T>(
    method: string,
    args?: Record<string, unknown>,
  ): Promise<T> {
    const bridge = await this.bridge();
    try {
      return (await bridge.request(method, args)) as T;
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      throw new Error(STORE_ERRORS[code] ?? NOT_CONNECTED);
    }
  }

  /** SKUs the store sells; null when the store cannot be asked (not installed, signed out, offline). */
  async products(skus: string[]): Promise<Set<string> | null> {
    try {
      const products = await this.request<{ sku: string }[]>('products', {
        skus,
      });
      return new Set(products.map((product) => product.sku));
    } catch {
      return null;
    }
  }

  /** Checks the plan with our server, opens the store's purchase sheet, then has the purchase verified. */
  async buy(plan: string): Promise<BillingReturnStatus> {
    const store = this.store;
    if (!store) throw new Error('Not a store build');
    const intent = await firstValueFrom(
      this.http.post<BillingStoreIntent>(`${this.api}/billing/store/intent`, {
        store,
        plan,
      }),
    );
    const purchase = await this.request<StorePurchase | null>('purchase', {
      sku: intent.sku,
      payload: intent.payload,
    });
    if (!purchase) throw new StorePurchaseCanceled();
    return this.settle(store, purchase);
  }

  /**
   * Sends purchases the store holds but never saw consumed (the app closed or our server was down) again.
   * Purchases of another account on this device are left for that account. Returns how many were activated.
   */
  async restore(): Promise<number> {
    const store = this.store;
    if (!store) return 0;
    let activated = 0;
    for (const purchase of await this.request<StorePurchase[]>('purchases')) {
      try {
        if ((await this.settle(store, purchase)) === 'paid') activated++;
      } catch (error) {
        if (
          !(error instanceof HttpErrorResponse) ||
          ![409, 422].includes(error.status)
        )
          throw error;
      }
    }
    return activated;
  }

  private async settle(
    store: BillingStore,
    purchase: StorePurchase,
  ): Promise<BillingReturnStatus> {
    const { status } = await firstValueFrom(
      this.http.post<{ status: BillingReturnStatus }>(
        `${this.api}/billing/store/verify`,
        { store, sku: purchase.sku, purchaseToken: purchase.purchaseToken },
      ),
    );
    // Consumed only once the time is ours to give; a failed consume is retried by restore().
    if (status === 'paid')
      await this.request('consume', {
        purchaseToken: purchase.purchaseToken,
      }).catch(() => undefined);
    return status;
  }
}
