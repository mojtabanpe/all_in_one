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
        questions: [],
        phrases: [],
      }),
      transcribe: vi.fn(),
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
    await click('تمرین تازه');
    return { api, tts, fixture, el, click, getUserMedia, revoke };
  }

  it('practises each sentence at the chosen speed, hides the transcript and completes/restarts', async () => {
    const { api, tts, el, click } = await setup();
    expect(api.dialogue).toHaveBeenCalledWith('small-talk', 'B1');
    expect(el.textContent).toContain('جمله ۱ از ۲');
    expect(el.textContent).not.toContain('Could I have a coffee?');
    await click('نمایش متن');
    expect(el.textContent).toContain('Could I have a coffee?');
    await click('آهسته');
    await click('پخش جمله');
    expect(tts.rate).toBe(0.75);
    expect(tts.speak).toHaveBeenLastCalledWith(
      'Could I have a coffee?',
      'primary',
    );
    await click('جمله بعد');
    expect(el.textContent).toContain('جمله ۲ از ۲');
    await click('پخش جمله');
    expect(tts.speak).toHaveBeenLastCalledWith(
      'Of course. Anything else?',
      'secondary',
    );
    await click('پایان تمرین');
    expect(el.textContent).toContain('همه جمله‌ها را تمرین کردی');
    await click('یک دور دیگر');
    expect(el.textContent).toContain('جمله ۱ از ۲');
    expect(el.textContent).not.toContain('همه جمله‌ها را تمرین کردی');
  });

  it('records alongside playback without STT and releases the recording on sentence change', async () => {
    const { api, tts, el, click, revoke } = await setup();
    await click('ضبط همراه گوینده');
    expect(el.textContent).toContain('در حال ضبط');
    await click('پخش جمله');
    expect(tts.speak).toHaveBeenCalled();
    await click('پایان ضبط');
    expect(el.querySelector('audio')?.getAttribute('src')).toBe('blob:voice');
    expect(api.transcribe).not.toHaveBeenCalled();
    expect(stopTrack).toHaveBeenCalled();
    await click('جمله بعد');
    expect(el.querySelector('audio')).toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:voice');
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
});
