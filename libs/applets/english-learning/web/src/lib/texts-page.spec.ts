import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { READING_TOPICS } from '@all-in-one/applets/english-learning/contracts';
import { AioLocale } from '@all-in-one/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnglishApi } from './english-api';
import { TextsPage } from './texts-page';

describe('TextsPage reading topic labels', () => {
  afterEach(() => {
    TestBed.inject(AioLocale).setLanguage('fa');
    TestBed.resetTestingModule();
    localStorage.removeItem('poshtetgarm_language');
    document.cookie = 'poshtetgarm_language=; Path=/; Max-Age=0';
  });

  async function setup() {
    const readingText = vi.fn().mockResolvedValue({
      title: 'The Past',
      body: 'A short reading passage.',
    });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: EnglishApi,
          useValue: {
            base: '/api/english',
            readingText,
          },
        },
      ],
    });

    const locale = TestBed.inject(AioLocale);
    locale.setLanguage('fa');
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TextsPage);
    fixture.detectChanges();
    http.expectOne('/api/english/texts').flush([]);
    await fixture.whenStable();

    fixture.componentInstance['openNew']();
    fixture.detectChanges();
    await fixture.whenStable();

    return { fixture, locale, readingText };
  }

  it('shows pure Persian labels in fa and pure English labels in en while keeping topic ids intact', async () => {
    const { fixture, locale, readingText } = await setup();

    const readOptions = () => {
      const select = document.getElementById(
        'text-topic',
      ) as HTMLSelectElement | null;
      expect(select).toBeTruthy();
      return [...select!.options].map((option) => ({
        value: option.value,
        label: option.textContent?.trim() ?? '',
      }));
    };

    const faOptions = readOptions();
    expect(faOptions).toHaveLength(READING_TOPICS.length);
    for (const [index, topic] of READING_TOPICS.entries()) {
      expect(faOptions[index].value).toBe(topic.id);
      expect(faOptions[index].label).toBe(topic.fa);
      expect(faOptions[index].label).not.toMatch(/[A-Za-z]/);
    }

    locale.setLanguage('en');
    fixture.detectChanges();
    await fixture.whenStable();

    const enOptions = readOptions();
    expect(enOptions).toHaveLength(READING_TOPICS.length);
    for (const [index, topic] of READING_TOPICS.entries()) {
      expect(enOptions[index].value).toBe(topic.id);
      expect(enOptions[index].label).toBe(topic.label);
      expect(enOptions[index].label).not.toMatch(/\p{Script=Arabic}/u);
    }

    const select = document.getElementById('text-topic') as HTMLSelectElement;
    select.value = 'history';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance['generate']();
    expect(readingText).toHaveBeenCalledWith('history', 'B2');

    fixture.componentInstance['closeModal']();
    fixture.detectChanges();
    await fixture.whenStable();
  });
});
