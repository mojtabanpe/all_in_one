import { AioLocale } from '@all-in-one/ui';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { EnglishApi } from './english-api';
import { PracticePage } from './practice-page';
import { Tts } from './tts';

describe('Shadowing practice', () => {
  const stopTrack = vi.fn();
  const stream = { getTracks: () => [{ stop: stopTrack }] };
  class Recorder {
    static isTypeSupported = () => true;
    state = 'inactive';
    mimeType = 'audio/webm';
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['voice']) });
      this.onstop?.();
    }
  }

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function setup() {
    const api = {
      decks: vi.fn().mockResolvedValue([]),
      dialogue: vi.fn().mockResolvedValue({
        title: 'Coffee',
        lines: [
          { speaker: 'A', text: 'Could I have a coffee?' },
          { speaker: 'B', text: 'Of course. Anything else?' },
        ],
        questions: [
          {
            question: 'What does A want?',
            options: ['Tea', 'Coffee'],
            answer: 1,
          },
          { question: 'Is there more?', options: ['Yes', 'No'], answer: 0 },
        ],
        phrases: [],
      }),
      transcribe: vi.fn().mockResolvedValue({ text: 'could I have coffee' }),
      savePracticeScore: vi.fn((input) =>
        Promise.resolve({
          ...input,
          id: 's1',
          createdAt: '2026-11-02T10:00:00Z',
        }),
      ),
      practiceScores: vi.fn().mockResolvedValue([]),
      writingTask: vi.fn().mockResolvedValue({
        scenario: 'Order a coffee',
        message: 'What can I get you?',
      }),
      writingFeedback: vi.fn().mockResolvedValue({
        corrected: 'I would like a coffee.',
        natural: 'Could I get a coffee?',
        mistakes: [
          {
            original: 'I like coffee',
            fix: 'I would like a coffee',
            why: 'polite request',
          },
        ],
        phrases: [],
        comment: 'Nearly there.',
      }),
    };
    const tts = {
      rate: 1,
      stop: vi.fn(),
      speak: vi.fn().mockResolvedValue(undefined),
    };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('MediaRecorder', Recorder);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:voice'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revoke,
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap({ mode: 'shadowing' }),
            },
          },
        },
        { provide: EnglishApi, useValue: api },
        { provide: Tts, useValue: tts },
      ],
    });
    TestBed.inject(AioLocale).setLanguage('en');
    const fixture = TestBed.createComponent(PracticePage);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const click = async (label: string) => {
      const button = [...el.querySelectorAll('button')].find((b) =>
        b.textContent?.includes(label),
      );
      expect(button, label).toBeTruthy();
      if (!button) throw new Error(`Missing button: ${label}`);
      button.click();
      await fixture.whenStable();
    };
    await click('New exercise');
    return { api, tts, fixture, el, click, getUserMedia, revoke };
  }

  it('practises each sentence at the chosen speed, hides the transcript and completes/restarts', async () => {
    const { api, tts, el, click } = await setup();
    expect(api.dialogue).toHaveBeenCalledWith('small-talk', 'B1');
    expect(el.textContent).toContain('Sentence 1 of 2');
    expect(el.textContent).not.toContain('Could I have a coffee?');
    await click('Show transcript');
    expect(el.textContent).toContain('Could I have a coffee?');
    await click('Slow');
    await click('Play sentence');
    expect(tts.rate).toBe(0.75);
    expect(tts.speak).toHaveBeenLastCalledWith(
      'Could I have a coffee?',
      'primary',
    );
    await click('next sentence');
    expect(el.textContent).toContain('Sentence 2 of 2');
    await click('Play sentence');
    expect(tts.speak).toHaveBeenLastCalledWith(
      'Of course. Anything else?',
      'secondary',
    );
    await click('Finish practice');
    expect(el.textContent).toContain('You practised every sentence');
    await click('Practise again');
    expect(el.textContent).toContain('Sentence 1 of 2');
    expect(el.textContent).not.toContain('You practised every sentence');
  });

  it('checks every recording word by word and saves a strict session score', async () => {
    const { api, tts, fixture, el, click, revoke } = await setup();
    await click('Record along with the speaker');
    expect(el.textContent).toContain('Recording.');
    await click('Play sentence');
    expect(tts.speak).toHaveBeenCalled();
    await click('Stop recording');
    expect(el.querySelector('audio')?.getAttribute('src')).toBe('blob:voice');
    expect(api.transcribe).toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
    await fixture.whenStable();
    // "Could I have a coffee?" heard as "could I have coffee": one skipped word.
    expect(el.textContent).toContain('You skipped “a”.');
    expect(el.textContent).toContain('Score for this sentence: 70/100');
    await click('next sentence');
    expect(el.querySelector('audio')).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:voice');
    await click('Finish practice');
    // Sentence 2 was not recorded: it counts as zero.
    expect(api.savePracticeScore).toHaveBeenCalledWith({
      kind: 'SHADOWING',
      title: 'Coffee',
      score: 35,
      items: 2,
      attempted: 1,
    });
    await fixture.whenStable();
    expect(el.textContent).toContain('Saved to your progress.');
  });

  it('releases a microphone granted after leaving and ignores stale playback completion', async () => {
    const { fixture, getUserMedia, tts } = await setup();
    let resolveStream!: (value: typeof stream) => void;
    getUserMedia.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStream = resolve;
      }),
    );
    const pending = fixture.componentInstance['record']();
    fixture.componentInstance['setMode']('writing');
    stopTrack.mockClear();
    resolveStream(stream);
    await pending;
    expect(stopTrack).toHaveBeenCalled();
    expect(fixture.componentInstance['recording']()).toBe(false);
    expect(fixture.componentInstance['recordingPending']()).toBe(false);

    fixture.componentInstance['setMode']('shadowing');
    let finish!: () => void;
    tts.speak.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const oldPlayback = fixture.componentInstance['playShadow']();
    fixture.componentInstance['stop']();
    tts.speak.mockReturnValueOnce(new Promise<void>(() => undefined));
    void fixture.componentInstance['playShadow']();
    finish();
    await oldPlayback;
    expect(fixture.componentInstance['playing']()).toBe(true);
    fixture.destroy();
    expect(tts.stop).toHaveBeenCalled();
  });

  it('scores listening by first picks and saves it once', async () => {
    const { api, fixture, el } = await setup();
    fixture.componentInstance['setMode']('listening');
    await fixture.whenStable();
    fixture.componentInstance['choose'](0, 1); // right
    fixture.componentInstance['choose'](1, 1); // wrong
    fixture.componentInstance['choose'](1, 0); // ignored: first pick counts
    await fixture.whenStable();
    expect(api.savePracticeScore).toHaveBeenCalledTimes(1);
    expect(api.savePracticeScore).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'LISTENING',
        score: 50,
        items: 2,
        mistakes: 1,
      }),
    );
    expect(el.textContent).toContain('1 of 2 answers right on the first try.');
  });

  it('scores written answers strictly from the feedback mistakes', async () => {
    const { api, fixture, el } = await setup();
    const page = fixture.componentInstance;
    page['setMode']('writing');
    await page['newTask']();
    page['patch']({ answer: 'I like coffee please thanks' }, 'writing');
    await page['check']();
    await fixture.whenStable();
    // 1 mistake in 5 words: 100 * (1 - 1.5 / 5) = 70.
    expect(api.savePracticeScore).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'WRITING', score: 70, mistakes: 1 }),
    );
    expect(el.textContent).toContain('Saved to your progress.');
  });
});

afterEach(() => {
  localStorage.removeItem('poshtetgarm_language');
  document.cookie = 'poshtetgarm_language=; Path=/; Max-Age=0';
});
