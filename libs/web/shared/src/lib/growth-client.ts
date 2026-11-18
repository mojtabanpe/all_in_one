import type { GrowthClient } from '@all-in-one/shared/schemas';

/** Current client, not a verified installer or the person's acquisition source. */
export function detectGrowthClient(environment: {
  userAgent: string;
  nativeBridge: boolean;
  standalone: boolean;
}): GrowthClient {
  const { userAgent, nativeBridge, standalone } = environment;
  const store = /\bPoshtetgarmStore\/(bazaar|myket)\b/.exec(userAgent)?.[1];
  if (store === 'bazaar' || store === 'myket') return store;
  if (nativeBridge) {
    if (/Android/i.test(userAgent)) return 'direct_apk';
    if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macos';
    return 'unknown_app';
  }
  // Links shared on social apps open in that app's own browser.
  if (/\bInstagram\b/.test(userAgent)) return 'instagram_browser';
  if (/LinkedInApp/i.test(userAgent)) return 'linkedin_browser';
  if (/Telegram/i.test(userAgent)) return 'telegram_browser';
  if (/\bFBA[NV]\/|\bFB_IAB\b/.test(userAgent)) return 'facebook_browser';
  // A generic Android WebView is not enough evidence to call it our direct APK.
  if (/\bwv\b/.test(userAgent)) return 'unknown_app';
  return standalone ? 'pwa' : 'web';
}
