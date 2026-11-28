import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { TelegramLinkEntry } from '@all-in-one/shared/schemas';
import { AioNotifications } from '@all-in-one/ui';
import { API_BASE_URL } from '../api/api-base-url';
import { GrowthAnalytics } from '../growth-analytics';
import { TelegramOffer } from './telegram-offer';

describe('Telegram reminder offer', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function setup(
    status: { available: boolean; linked: boolean },
    entry: TelegramLinkEntry = 'review_end',
  ) {
    const track = vi.fn(async () => undefined);
    const error = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: '/api' },
        { provide: GrowthAnalytics, useValue: { track } },
        { provide: AioNotifications, useValue: { error } },
      ],
    });
    const fixture = TestBed.createComponent(TelegramOffer);
    fixture.componentRef.setInput('entry', entry);
    const http = TestBed.inject(HttpTestingController);
    const settle = async () => {
      for (let turn = 0; turn < 3; turn++) {
        await new Promise((resolve) => setTimeout(resolve));
        fixture.detectChanges();
      }
    };
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    // Nothing appears or is counted before the server says the offer applies.
    expect(element.textContent?.trim()).toBe('');
    expect(track).not.toHaveBeenCalled();
    http.expectOne('/api/telegram/status').flush(status);
    await settle();
    return { fixture, element, http, settle, track, error };
  }

  it.each([
    ['review_end', 'tg_offer_viewed_review_end', 'tg_offer_clicked_review_end'],
    ['notify_failed', 'tg_offer_viewed_notify', 'tg_offer_clicked_notify'],
  ] as const)(
    'makes a one-time link for %s and counts the view and the click',
    async (entry, viewed, clicked) => {
      const { element, http, settle, track } = await setup(
        { available: true, linked: false },
        entry,
      );
      expect(track.mock.calls).toEqual([[viewed]]);
      const button = element.querySelector('button');
      expect(button?.textContent).toContain('یادآور در تلگرام');
      expect(button?.classList).toContain('min-h-11');

      button?.click();
      const link = http.expectOne('/api/telegram/link');
      expect(link.request.method).toBe('POST');
      expect(link.request.body).toEqual({ language: 'fa', entry });
      link.flush({ url: 'https://t.me/test_bot?start=code' });
      await settle();

      const anchor = element.querySelector('a');
      expect(anchor?.getAttribute('href')).toBe(
        'https://t.me/test_bot?start=code',
      );
      expect(anchor?.getAttribute('target')).toBe('_blank');
      expect(anchor?.classList).toContain('min-h-11');
      expect(track.mock.calls).toEqual([[viewed], [clicked]]);
    },
  );

  it('shows and counts nothing while the bot is unavailable on the server', async () => {
    const { element, track } = await setup({ available: false, linked: false });
    expect(element.textContent?.trim()).toBe('');
    expect(element.querySelector('button, a')).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it('stays silent when unavailable on the server even for a previously linked account', async () => {
    const { element } = await setup({ available: false, linked: true });
    expect(element.textContent?.trim()).toBe('');
  });

  it.each(['myket', 'bazaar'] as const)(
    'shows the offer, plain shell navigation, and linked state in the %s Android shell (209)',
    async (store) => {
      vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
        `Mozilla/5.0 (Linux; Android 14; wv) PoshtetgarmApp/1.0.7 PoshtetgarmStore/${store}`,
      );
      const { element, http, settle, track } = await setup(
        { available: true, linked: false },
        'review_end',
      );
      expect(track.mock.calls).toEqual([['tg_offer_viewed_review_end']]);
      const button = element.querySelector('button');
      expect(button?.textContent).toContain('یادآور در تلگرام');

      button?.click();
      const link = http.expectOne('/api/telegram/link');
      expect(link.request.body).toEqual({
        language: 'fa',
        entry: 'review_end',
      });
      link.flush({ url: 'https://t.me/test_bot?start=code' });
      await settle();

      const anchor = element.querySelector('a');
      expect(anchor?.getAttribute('href')).toBe(
        'https://t.me/test_bot?start=code',
      );
      expect(anchor?.getAttribute('target')).toBeNull();
      expect(track.mock.calls).toEqual([
        ['tg_offer_viewed_review_end'],
        ['tg_offer_clicked_review_end'],
      ]);

      document.dispatchEvent(new Event('visibilitychange'));
      await settle();
      http
        .expectOne('/api/telegram/status')
        .flush({ available: true, linked: true });
      await settle();
      expect(element.textContent).toContain('تلگرام وصل است.');
    },
  );

  it('replaces the offer with one line once linked', async () => {
    const { element, track } = await setup({ available: true, linked: true });
    expect(element.textContent).toContain('تلگرام وصل است.');
    expect(element.querySelector('button, a')).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it('checks the link again after the user comes back from Telegram', async () => {
    const { element, http, settle } = await setup({
      available: true,
      linked: false,
    });
    element.querySelector('button')?.click();
    http.expectOne('/api/telegram/link').flush({ url: 'https://t.me/b' });
    await settle();
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    http
      .expectOne('/api/telegram/status')
      .flush({ available: true, linked: true });
    await settle();
    expect(element.textContent).toContain('تلگرام وصل است.');
  });

  it('keeps the button for a retry when the link cannot be made', async () => {
    const { element, http, settle, error } = await setup({
      available: true,
      linked: false,
    });
    element.querySelector('button')?.click();
    http
      .expectOne('/api/telegram/link')
      .flush(null, { status: 503, statusText: 'Unavailable' });
    await settle();
    expect(error).toHaveBeenCalled();
    expect(element.querySelector('button')?.disabled).toBe(false);
  });
});
