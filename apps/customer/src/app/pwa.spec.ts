import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { SwUpdate } from '@angular/service-worker';
import {
  APP_VERSION_TOKEN,
  AppVersionState,
  GrowthAnalytics,
} from '@all-in-one/web/shared';
import { Pwa } from './pwa';

describe('PWA installation', () => {
  function setup(
    userAgent = 'Chrome/140',
    standalone = false,
    maxTouchPoints = 0,
  ) {
    const media = Object.assign(new EventTarget(), { matches: standalone });
    const store = new Map<string, string>();
    const reload = vi.fn();
    const win = Object.assign(new EventTarget(), {
      navigator: { userAgent, maxTouchPoints, onLine: true },
      matchMedia: () => media,
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    const track = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        { provide: APP_VERSION_TOKEN, useValue: '0.1.5' },
        {
          provide: DOCUMENT,
          useValue: { defaultView: win, location: { reload } },
        },
        { provide: SwUpdate, useValue: { isEnabled: false } },
        { provide: GrowthAnalytics, useValue: { track } },
      ],
    });
    return {
      pwa: TestBed.inject(Pwa),
      versionState: TestBed.inject(AppVersionState),
      win,
      media,
      track,
      reload,
    };
  }

  afterEach(() => TestBed.resetTestingModule());

  it('captures installation before login and prompts only once', async () => {
    const { pwa, win, track } = setup();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(
      new Event('beforeinstallprompt', { cancelable: true }),
      { prompt },
    );
    win.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(pwa.installAvailable()).toBe(true);
    expect(track).not.toHaveBeenCalled();
    await pwa.install();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(pwa.canInstall()).toBe(false);
    expect(track.mock.calls).toEqual([['pwa_install_prompt']]);
    win.dispatchEvent(new Event('appinstalled'));
    expect(pwa.installAvailable()).toBe(false);
    await pwa.install();
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(pwa.installGuideOpen()).toBe(false);
    expect(track.mock.calls).toEqual([
      ['pwa_install_prompt'],
      ['pwa_installed'],
    ]);
  });

  it('offers manual installation on iPhone and iPad without a browser prompt', async () => {
    const { pwa, track } = setup(
      'Mozilla/5.0 (iPhone) AppleWebKit/605.1 Safari/604.1',
    );
    expect(pwa.manualInstall()).toBe('ios');
    expect(pwa.installAvailable()).toBe(true);
    await pwa.install();
    expect(pwa.installGuideOpen()).toBe(true);
    expect(track).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    expect(
      setup(
        'Mozilla/5.0 (Macintosh) Safari/605.1',
        false,
        5,
      ).pwa.manualInstall(),
    ).toBe('ios');
  });

  it('offers Safari Add to Dock guidance but hides installation in standalone mode', () => {
    const { pwa, media } = setup(
      'Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1',
    );
    expect(pwa.manualInstall()).toBe('safari');
    expect(pwa.installAvailable()).toBe(true);
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    expect(pwa.installAvailable()).toBe(false);
  });

  it('does not advertise installation when launched as an installed app', () => {
    const { pwa, win } = setup('Chrome/140', true);
    win.dispatchEvent(new Event('beforeinstallprompt'));
    expect(pwa.canInstall()).toBe(false);
    expect(pwa.installAvailable()).toBe(false);
  });

  it('opens manual recovery if the native install prompt fails', async () => {
    const { pwa, win, track } = setup();
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn().mockRejectedValue(new Error('unavailable')),
    });
    win.dispatchEvent(event);
    await pwa.install();
    expect(pwa.installGuideOpen()).toBe(true);
    expect(track).not.toHaveBeenCalled();
  });

  it('surfaces newer API versions without a service worker and rate-limits reloads', async () => {
    const { pwa, versionState, reload } = setup();
    expect(pwa.updateReady()).toBe(false);
    versionState.observe('0.1.5');
    expect(pwa.updateReady()).toBe(false);
    versionState.observe('0.1.6');
    expect(pwa.updateReady()).toBe(true);
    pwa.dismissUpdate();
    expect(pwa.updateReady()).toBe(false);
    versionState.observe('0.1.7');
    expect(pwa.updateReady()).toBe(true);
    await pwa.reload();
    await pwa.reload();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
