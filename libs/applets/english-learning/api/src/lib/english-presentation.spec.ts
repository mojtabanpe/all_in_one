import type { AiGateway } from '@all-in-one/api/ai';
import { AiService } from './ai.service';
import type { TextsService } from './texts.service';
import type { ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { EnglishPresentationInterceptor } from './english.controller';
import {
  ENGLISH_DECKS,
  englishStarterCard,
  englishStarterDeck,
} from './starter-data';

describe('English immersion content', () => {
  it('checks translation before writes, so AI failures cannot produce duplicate saves', async () => {
    const ai = {
      presentInEnglish: vi
        .fn()
        .mockRejectedValue(new Error('Translation unavailable')),
    };
    const interceptor = new EnglishPresentationInterceptor(
      ai as unknown as AiService,
    );
    const next = { handle: vi.fn(() => of({ id: 'saved' })) };
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          body: { back: 'سلام' },
          user: { id: 'owner' },
        }),
      }),
    } as unknown as ExecutionContext;
    await expect(
      firstValueFrom(interceptor.intercept(context, next)),
    ).rejects.toThrow('Translation unavailable');
    expect(next.handle).not.toHaveBeenCalled();
    expect(ai.presentInEnglish).toHaveBeenCalledWith('owner', { back: 'سلام' });
  });
  const setup = () => {
    const text = vi.fn();
    return {
      text,
      ai: new AiService({ text } as unknown as AiGateway, {} as TextsService),
    };
  };

  it('provides English definitions and examples for every starter card, including copied legacy cards', () => {
    expect(ENGLISH_DECKS.flatMap((d) => d.words)).toHaveLength(48);
    expect(JSON.stringify(ENGLISH_DECKS)).not.toMatch(/\p{Script=Arabic}/u);
    const legacy = {
      id: 'card',
      front: 'breakfast',
      back: 'صبحانه',
      examples: '- We have breakfast together.\n- با هم صبحانه می‌خوریم.',
      intervalDays: 12,
    };
    const english = englishStarterCard(legacy);
    expect(english.back).toBe('The meal you eat in the morning.');
    expect(english.examples).toBe('- We have breakfast together.');
    expect(english.intervalDays).toBe(12);
    expect(legacy.back).toBe('صبحانه');
    expect(
      englishStarterCard({ ...legacy, back: 'My own definition' }).back,
    ).toBe('My own definition');
    expect(
      englishStarterDeck({ name: 'سفر', description: 'My own notes' }),
    ).toEqual({ name: 'Travel', description: 'My own notes' });
  });

  it('translates nested custom content for display, caches per owner and preserves original data', async () => {
    const { text, ai } = setup();
    text.mockResolvedValue('["My vocabulary", "A greeting"]');
    const source = {
      id: 'deck',
      name: 'واژه‌های من',
      cards: [{ back: 'سلام', intervalDays: 7 }],
    };
    expect(await ai.presentInEnglish('owner', source)).toEqual({
      id: 'deck',
      name: 'My vocabulary',
      cards: [{ back: 'A greeting', intervalDays: 7 }],
    });
    expect(source.cards[0].back).toBe('سلام');
    await ai.presentInEnglish('owner', source);
    expect(text).toHaveBeenCalledTimes(1);
    await ai.presentInEnglish('someone-else', source);
    expect(text).toHaveBeenCalledTimes(2);
    expect(text.mock.calls[0][0]).toBe('owner');
    expect(text.mock.calls[1][0]).toBe('someone-else');
  });

  it('does not call AI for English content and fails clearly without leaking untranslated text', async () => {
    const { text, ai } = setup();
    const value = { front: 'hello', back: 'A greeting' };
    expect(await ai.presentInEnglish('owner', value)).toBe(value);
    expect(text).not.toHaveBeenCalled();
    text.mockResolvedValue('["هنوز فارسی"]');
    await expect(
      ai.presentInEnglish('owner', { back: 'سلام' }),
    ).rejects.toThrow('This content needs English translation');
  });
});
