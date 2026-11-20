# اطلاع‌رسانی نسخهٔ قدیمی (آماده برای واگذاری به agent دیگر)

وضعیت: **DONE، منتشرشده در `2aac98f` (Deploy 44727099225، 2026-11-20؛ `X-Aio-Version: 0.1.336` روی production دیده شد؛ APK `1.0.7` در run 44723809118 ساخته شد، انتشار در فروشگاه‌ها تأیید نشده).** نوشته‌شده در ۲۰۲۶-۱۱-۲۰؛ پیاده‌سازی و آزمون محلی در ۲۰۲۶-۱۱-۲۰ انجام شد. کار روی `master` محلی انجام و commit می‌شود؛ طبق بند ۱۲۴ تا مالک نگوید push نمی‌شود. پیش از شروع `AGENTS.md` (بخش‌های «Project conventions» و «User directives»، به‌ویژه بندهای ۱۱۱، ۱۳۱، ۱۵۵، ۱۶۷، ۱۷۵ و ۱۸۰) و این فایل را بخوان. بعد از کار، وضعیت و شواهد همین فایل و ردیف ایندکس `docs/roadmaps/README.md` را در همان commit به‌روز کن (بند ۱۰۷).

## مشکل

کسی که نسخهٔ قدیمی را دارد، نمی‌فهمد نسخهٔ تازه آمده است. دو لایهٔ جدا دارد و راه‌حل‌هایشان فرق می‌کند.

## بخش ۱: نسخهٔ وب (PWA و مرورگر) بدون وابستگی به service worker

**چه داریم (بخوان، چیزی را خراب نکن):**

- `apps/customer/src/app/pwa.ts`: کلاس `Pwa` با سیگنال `updateReady` که از `SwUpdate.versionUpdates` (`VERSION_READY`) پر می‌شود و نوار «نسخهٔ جدید» را نشان می‌دهد. هر ۳۰ دقیقه و با `visibilitychange` بررسی می‌کند.
- بند ۱۱۱: ورودی `index.html` در فهرست دارایی‌های service worker و سیاست network-first برای ناوبری **باید همان‌طور بماند**.
- نسخه: `libs/web/shared/src/lib/release-version.ts` (`APP_VERSION`)، که گردش‌کار Deploy با `tools/scripts/write-app-version.mjs` و `RELEASE_PATCH` مهر می‌زند. api این نسخه را **ندارد**.

**ضعف:** اگر service worker گیر کند (iOS، بعضی گوشی‌ها، حافظهٔ پاک‌شده)، کاربر هرگز `VERSION_READY` نمی‌گیرد.

**خواسته:** یک بررسی مستقل از service worker.

1. api نسخهٔ در حال اجرا را در هدر هر پاسخ بگذارد (مثلاً `X-Aio-Version`). برای این api باید همان `RELEASE_PATCH` را بداند: راه ساده این است که گردش‌کار Deploy آن را به‌صورت env (`APP_VERSION`) به ایمیج api بدهد، یا `write-app-version.mjs` خروجی‌اش را در جایی بنویسد که api بخواند. روش را خودت انتخاب کن و در این فایل ثبت کن. ایمیج‌ها فقط روی GitHub ساخته می‌شوند (بند ۳۸).
2. اپ مشتری (و در صورت لزوم مدیر) پاسخ‌های api را با یک `HttpInterceptorFn` بخواند. اگر نسخهٔ هدر از `APP_VERSION` بسته جدیدتر باشد، همان سیگنال `updateReady` را روشن کند. مقایسه به‌صورت SemVer، نه رشته.
3. هدر باید از nginx (`deploy/nginx.app.conf`، `deploy/nginx.conf`) رد شود و CORS آن را مسدود نکند.
4. بعد از `reload` نسخهٔ تازه باید واقعاً لود شود: اگر `activateUpdate()` در دسترس نبود، `location.reload()` کافی است. حلقهٔ بی‌پایان reload ممنوع (بیش از یک بار در دقیقه نه).
5. هر listener یا timer تازه با `DestroyRef`/`AbortController` پاک شود (بند ۱۶۷).
6. متن‌ها فارسی و انگلیسی از جدول `libs/shared/packages/localization`؛ متن کوتاه و مستقیم (بند ۱۶۶).

**پذیرش:**

- تست واحد: هدر جدیدتر → `updateReady` روشن؛ برابر یا قدیمی‌تر → روشن نمی‌شود؛ هدر نبودن (api قدیمی) → هیچ اتفاقی.
- در مرورگر محلی با service worker خاموش، پس از «انتشار» یک نسخهٔ ساختگی، نوار نشان داده شود.
- `pnpm nx format:check` و `pnpm nx run-many -t lint test build typecheck` سبز.

## بخش ۲: پوستهٔ native اندروید قدیمی

**واقعیت‌ها:**

- اپ‌های بازار و مایکت و APK مستقیم، WebView از `https://poshtetgarm.ir/app` هستند (بند ۱۵۵)، پس کد وب با هر release خودکار تازه می‌شود. فقط **خود پوسته** قدیمی می‌ماند (مثلاً اعلان محلی فقط از ۱.۰.۶، بند ۱۷۵).
- پوسته در `native/poshtetgarm` است (نسخهٔ فعلی `1.0.6+7` در `pubspec.yaml`). بازار و مایکت با `PoshtetgarmStore/<store>` در user agent خود را معرفی می‌کنند (`native/poshtetgarm/lib/store_billing.dart`). نسخهٔ پوسته در user agent **نیست**.
- پوسته‌های قدیمی را از سمت وب نمی‌شود تغییر داد.

**خواسته (دو قدم):**

1. **از این به بعد:** در `native/poshtetgarm/lib/main.dart` نسخهٔ پوسته را به user agent همهٔ flavorها اضافه کن (مثل `PoshtetgarmApp/1.0.7`)، نه فقط store builds. `detectGrowthClient` (`libs/web/shared/src/lib/growth-client.ts`) و هر چیزی که `PoshtetgarmStore` را می‌خواند نباید بشکند. نسخهٔ پوسته را بالا ببر. ساخت APK فقط از طریق گردش‌کار `Android APK` روی GitHub (بند ۱۵۵).
2. **برای پوسته‌های قدیمی (تقریبی، نه اندازه‌گیری دقیق):** حساب‌هایی که با user agent بازار/مایکت (یا APK مستقیم) می‌آیند ولی **هیچ** زمان‌بندی محلی نگرفته‌اند (`local_reminder_devices`، بند ۱۸۰، جدول و ستون‌ها را در `libs/api/db/prisma/schema/` خودت راستی‌آزمایی کن)، احتمالاً پوستهٔ قدیمی دارند. به آن‌ها یک اعلان درون‌برنامه‌ای (بند ۱۳۱، `apps/api/src/in-app-notifications.ts`) نشان بده: «نسخهٔ تازهٔ برنامه اعلان‌ها را بهتر می‌کند» با دکمه‌ای که صفحهٔ **همان فروشگاه** را باز کند (کد باز کردن صفحهٔ فروشگاه از اعلان امتیازدهی بند ۱۶۱ موجود است؛ از همان استفاده کن). برای APK مستقیم لینک GitHub Releases. هر حساب یک بار، با بستن یا زدن دکمه تمام می‌شود، و فقط وقتی نسخهٔ جدید واقعاً منتشر شده باشد. این را صادقانه «حدس» بنام؛ دقیق نیست.

**پذیرش:** تست یکپارچه برای منطق انتخاب حساب و اینکه اعلان یک بار ساخته می‌شود؛ مرور محلی با user agent ساختگی بازار؛ همهٔ بررسی‌ها سبز.

## ممنوع‌ها

- push یا deploy نکن (بند ۱۲۴).
- API key، توکن، یا مقدارهای `.env` سرور را در commit یا گزارش نیاور.
- `libs/shared/spartan` را دستی تغییر نده (بند ۱۹)؛ `confirm()`/`alert()` بومی نه.
- مشتری را با پیام اضافه آزار نده (بند ۱۶۶)؛ هیچ شعار یا متن تبلیغاتی اضافه نکن.

## وضعیت و شواهد

- **تاریخ:** ۲۰۲۶-۱۱-۲۰ (روی `master` محلی، بدون push یا deploy طبق بند ۱۲۴).
- **بخش ۱ (وب بدون وابستگی به Service Worker):**
  - روش انتخاب‌شده برای نسخهٔ api: اسکریپت `tools/scripts/write-app-version.mjs` نسخهٔ مهرشده با `RELEASE_PATCH` را در `libs/shared/schemas/src/lib/release-version.ts` (`APP_VERSION`) می‌نویسد تا `api` و اپ‌های وب هر دو دقیقاً همان نسخه را در ساخت ایمیج دریافت کنند (`libs/web/shared/src/lib/release-version.ts` از همان‌جا re-export می‌کند). در `apps/api/src/main.ts` هدر `X-Aio-Version` (با امکان override از `process.env.APP_VERSION`) و `Access-Control-Expose-Headers: X-Aio-Version` روی همهٔ پاسخ‌ها ست می‌شود و از `deploy/nginx.app.conf` / `deploy/nginx.conf` عبور می‌کند.
  - مقایسهٔ SemVer (`libs/shared/schemas/src/lib/app-version.ts`) و `appVersionInterceptor` + `AppVersionState` (`libs/web/shared/src/lib/api/app-version.interceptor.ts`) با محدودیت حداکثر یک بار `reload` در دقیقه (`sessionStorage`) اضافه و در `customer` (`Pwa.updateReady`) و `admin` (`apps/admin/src/app/app.ts`) متصل شدند.
- **بخش ۲ (پوستهٔ native اندروید):**
  - نسخهٔ پوسته در `native/poshtetgarm/pubspec.yaml` به `1.0.7+8` ارتقا یافت و `shellUserAgent` در `native/poshtetgarm/lib/store_billing.dart` / `main.dart` عبارت `PoshtetgarmApp/1.0.7` را به User-Agent همهٔ flavorها اضافه کرد بدون شکستن `PoshtetgarmStore/<store>` و `detectGrowthClient`.
  - در `apps/api/src/in-app-notifications.ts` متد `offerAndroidShellUpdate` اضافه شد: فقط وقتی `ANDROID_SHELL_LATEST_VERSION` (SemVer معتبر) روی سرور تنظیم شده باشد فعال می‌شود؛ برای `1.0.7+` مقایسهٔ دقیق SemVer با `PoshtetgarmApp/<ver>` و برای پوسته‌های قدیمی‌تر به‌صورت **حدس (تقریبی)** نبود رکورد در `local_reminder_devices` ملاک است. یک بار برای هر حساب و نسخهٔ منتشرشده ساخته می‌شود، با دکمهٔ کافه‌بازار / مایکت / GitHub Releases. در `apps/customer/src/app/layout.ts` برای `direct_apk` هینت `?client=direct_apk` ارسال و باز کردن لینک خارجی در همهٔ پوسته‌های اندروید با `window.location.assign` انجام می‌شود.
- **آزمون‌ها و شواهد تأییدشده:**
  - `pnpm nx format:check` سبز.
  - `CI=true pnpm nx run-many -t lint test build typecheck` روی ۲۴ پروژه بدون خطا سبز (از جمله `app-version.spec.ts`، `app-version.interceptor.spec.ts`، `pwa.spec.ts`، `growth-client.spec.ts`، `store-billing.spec.ts` و `in-app-notifications.spec.ts`).
  - `flutter test` در `native/poshtetgarm`: همهٔ ۷ تست (از جمله `shellUserAgent` و همخوانی `shellVersion` با `pubspec.yaml`) سبز.
  - `node tools/scripts/check-agent-docs.mjs` سبز.
  - مرورگر محلی (`http://localhost:4400` در حالت dev با Service Worker خاموش + API ساختگی با `X-Aio-Version: 0.1.99`): نوار «نسخه تازه آماده است» با دکمه‌های «بارگذاری دوباره» و «بعداً» مشاهده شد.
  - مرورگر محلی موبایل (Chrome DevTools emulation، `390x844`، User-Agent ساختگی `PoshtetgarmStore/bazaar`): شیت درون‌برنامه‌ای «نسخهٔ تازهٔ برنامه آماده است» / «نسخهٔ تازهٔ برنامه اعلان‌ها را بهتر می‌کند.» با دکمهٔ «به‌روزرسانی در کافه‌بازار» مشاهده شد.
- **تأیید نشده / باقی‌مانده برای بعد از push:**
  - آزمون یکپارچهٔ PostgreSQL (`IN_APP_DB_INTEGRATION=1`، تست اضافه شد ولی دیتابیس محلی خاموش بود).
  - `flutter analyze` محلی (SDK محلی `analysis_server_aot.dart.snapshot` نداشت؛ روی CI اجرا می‌شود).
  - ساخت APK از گردش‌کار `Android APK` روی GitHub، انتشار نسخهٔ `1.0.7` در بازار/مایکت/GitHub Releases و تنظیم `ANDROID_SHELL_LATEST_VERSION=1.0.7` در محیط سرور پس از انتشار واقعی.
