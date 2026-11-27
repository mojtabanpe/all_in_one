import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AioInAppNotifications, AioNotifications } from '@all-in-one/ui';
import {
  API_BASE_URL,
  GrowthAnalytics,
  PushSettings,
} from '@all-in-one/web/shared';
import { PushPrompt } from './prompt-widgets';

describe('reminders sheet', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(review: string) {
    const track = vi.fn(async () => undefined);
    const message = signal('start');
    const enable = vi.fn(async () =>
      message.set(
        'اجازهٔ اعلان بسته است؛ آن را در تنظیمات مرورگر یا گوشی فعال کن.',
      ),
    );
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: GrowthAnalytics, useValue: { track } },
        { provide: AioNotifications, useValue: {} },
        { provide: AioInAppNotifications, useValue: { finish: vi.fn() } },
        {
          provide: PushSettings,
          useValue: {
            enabled: signal(false),
            busy: signal(false),
            message,
            enable,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PushPrompt);
    fixture.componentRef.setInput('review', review);
    const http = TestBed.inject(HttpTestingController);
    const element: HTMLElement = fixture.nativeElement;
    const settle = async () => {
      for (let turn = 0; turn < 3; turn++) {
        await new Promise((resolve) => setTimeout(resolve));
        fixture.detectChanges();
      }
    };
    const status = async () => {
      http
        .expectOne('/api/telegram/status')
        .flush({ available: true, linked: false });
      await settle();
    };
    const click = async (label: string) => {
      const button = Array.from(element.querySelectorAll('button')).find(
        (item) => item.textContent?.includes(label),
      );
      if (!button) throw new Error(`No button: ${label}`);
      button.click();
      await settle();
    };
    fixture.detectChanges();
    return { element, http, settle, status, click, track };
  }

  it('offers Telegram beside the review reminder, then as the way out of a failure', async () => {
    const { element, http, status, click, track } = await setup('20:00');
    await status();
    expect(element.textContent).toContain('روشن‌کردن یادآوری‌ها');
    expect(element.textContent).toContain('یادآور در تلگرام');
    expect(track.mock.calls).toEqual([['tg_offer_viewed_review_end']]);

    await click('روشن‌کردن یادآوری‌ها');
    // The option stays in place; only its entry point changes.
    http.expectNone('/api/telegram/status');
    await click('یادآور در تلگرام');
    expect(element.textContent).toContain('اجازهٔ اعلان بسته است');
    expect(track.mock.calls).toContainEqual(['tg_offer_viewed_notify']);
    const link = http.expectOne('/api/telegram/link');
    expect(link.request.body).toEqual({
      language: 'fa',
      entry: 'notify_failed',
    });
    link.flush({ url: 'https://t.me/b' });
  });

  it('adds nothing to the general reminders sheet until enabling fails', async () => {
    const { element, http, status, click, track } = await setup('');
    http.expectNone('/api/telegram/status');
    expect(element.textContent).not.toContain('تلگرام');
    await click('روشن‌کردن یادآوری‌ها');
    await status();
    expect(element.textContent).toContain('یادآور در تلگرام');
    expect(track.mock.calls).toEqual([['tg_offer_viewed_notify']]);
  });
});
