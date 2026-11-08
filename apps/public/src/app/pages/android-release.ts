/**
 * The Android WebView app published in this repository's GitHub Releases (directive 46, one APK per ABI, directive 57).
 * Update the tag and version together when a new native release is published.
 */
const TAG = 'native-2026-11-01';
const VERSION = '1.0.3';
const base = `https://github.com/mojtabanpe/all_in_one/releases/download/${TAG}/Poshtetgarm-${VERSION}`;

export const ANDROID_RELEASE = {
  version: VERSION,
  /** arm64 runs on almost every current phone. */
  main: `${base}-arm64-v8a.apk`,
  others: [
    { label: 'نسخهٔ گوشی‌های قدیمی', url: `${base}-armeabi-v7a.apk` },
    { label: 'نسخهٔ شبیه‌سازها و دستگاه‌های اینتل', url: `${base}-x86_64.apk` },
  ],
} as const;
