import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  READING_LEVELS,
  READING_TOPICS,
} from '@all-in-one/applets/english-learning/contracts';
import { AioLocale } from '@all-in-one/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EnglishApi } from './english-api';
import { TextsPage } from './texts-page';

describe('TextsPage reading topic and level labels', () => {
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

  it('shows clean fa and en labels for topics and levels while keeping ids intact', async () => {
    const { fixture, locale, readingText } = await setup();

    const readOptions = (id: string) => {
      const select = document.getElementById(id) as HTMLSelectElement | null;
      expect(select).toBeTruthy();
      return [...select!.options].map((option) => ({
        value: option.value,
        label: option.textContent?.trim() ?? '',
      }));
    };

    const faTopics = readOptions('text-topic');
    expect(faTopics).toHaveLength(READING_TOPICS.length);
    for (const [index, topic] of READING_TOPICS.entries()) {
      expect(faTopics[index].value).toBe(topic.id);
      expect(faTopics[index].label).toBe(topic.fa);
      expect(faTopics[index].label).not.toMatch(/[A-Za-z]/);
    }

    const faLevels = readOptions('text-level');
    expect(faLevels).toHaveLength(READING_LEVELS.length);
    for (const [index, level] of READING_LEVELS.entries()) {
      expect(faLevels[index].value).toBe(level.id);
      expect(faLevels[index].label).toBe(level.fa);
      expect(faLevels[index].label.replace(/\b(B1|B2|C1)\b/g, '')).not.toMatch(
        /[A-Za-z]/,
      );
    }

    locale.setLanguage('en');
    fixture.detectChanges();
    await fixture.whenStable();

    const enTopics = readOptions('text-topic');
    expect(enTopics).toHaveLength(READING_TOPICS.length);
    for (const [index, topic] of READING_TOPICS.entries()) {
      expect(enTopics[index].value).toBe(topic.id);
      expect(enTopics[index].label).toBe(topic.label);
      expect(enTopics[index].label).not.toMatch(/\p{Script=Arabic}/u);
    }

    const enLevels = readOptions('text-level');
    expect(enLevels).toHaveLength(READING_LEVELS.length);
    for (const [index, level] of READING_LEVELS.entries()) {
      expect(enLevels[index].value).toBe(level.id);
      expect(enLevels[index].label).toBe(level.label);
      expect(enLevels[index].label).not.toMatch(/\p{Script=Arabic}/u);
    }

    const topicSelect = document.getElementById(
      'text-topic',
    ) as HTMLSelectElement;
    topicSelect.value = 'history';
    topicSelect.dispatchEvent(new Event('change'));
    const levelSelect = document.getElementById(
      'text-level',
    ) as HTMLSelectElement;
    levelSelect.value = 'C1';
    levelSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();

    await fixture.componentInstance['generate']();
    expect(readingText).toHaveBeenCalledWith('history', 'C1');

    fixture.componentInstance['closeModal']();
    fixture.detectChanges();
    await fixture.whenStable();
  });
});
