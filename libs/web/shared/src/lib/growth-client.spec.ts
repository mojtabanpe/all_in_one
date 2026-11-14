import { detectGrowthClient } from './growth-client';

const android =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UP1A; wv) AppleWebKit/537.36 Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36';
describe('Observed app distribution', () => {
  it.each([
    [android + ' PoshtetgarmStore/bazaar', true, false, 'bazaar'],
    [android + ' PoshtetgarmStore/myket', true, false, 'myket'],
    // Store labels work before either injected bridge becomes ready.
    [android + ' PoshtetgarmStore/myket', false, false, 'myket'],
    [android, true, false, 'direct_apk'],
    [android, false, false, 'unknown_app'],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0', false, true, 'pwa'],
    ['Mozilla/5.0 (Linux; Android 14) Chrome/130.0.0.0', false, false, 'web'],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15',
      false,
      true,
      'pwa',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
      true,
      false,
      'macos',
    ],
  ])(
    'recognizes %s (bridge %s, standalone %s)',
    (userAgent, nativeBridge, standalone, expected) => {
      expect(
        detectGrowthClient({
          userAgent: String(userAgent),
          nativeBridge: Boolean(nativeBridge),
          standalone: Boolean(standalone),
        }),
      ).toBe(expected);
    },
  );
});
