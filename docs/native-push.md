# اعلان بومی اندروید و مک

پوستهٔ Flutter در `/Users/mojtabanpe/Projects/personal/hybrid/Poshtetgarm` از Firebase Messaging استفاده می‌کند. تنظیمات «حساب کاربری ← اعلان‌ها» در WebView، مجوز سیستم‌عامل را درخواست و توکن دستگاه را با نشست فعلی کاربر ثبت می‌کند. همان زمان‌بند تسک، عادت و مرور زبان، به اشتراک‌های PWA و دستگاه‌های بومی پیام می‌فرستد. کاربر باید صریحاً اعلان را فعال کند.

نسخهٔ قابل ساخت پوسته در `native/poshtetgarm` نیز در مخزن ثبت شده است. گردش‌کار **Android APK** ساخت را روی GitHub انجام می‌دهد تا به SDK ناقص یا دسترسی دانلود گوگل روی دستگاه محلی وابسته نباشد. APK در Artifacts همان اجرا قرار می‌گیرد؛ هیچ خروجی محلی مستقیماً به سرور منتقل نمی‌شود. این خروجی فعلاً با debug signing برای نصب مستقیم ساخته می‌شود؛ امضای ثابت انتشار فروشگاهی جداگانه لازم است.

## وضعیت فعال‌سازی

پروژهٔ Firebase با شناسهٔ `poshtetgarm` و Sender ID برابر `255033746187` ساخته و اپ Android با پکیج صحیح ثبت شده است. تنظیمات عمومی فایل `google-services.json` در `firebase.android.json` پوسته قرار گرفته‌اند. فعال‌شدن ارسال سرور به secret حساب سرویس و دریافت واقعی به ساخت و نصب نسخهٔ جدید Android وابسته است؛ هنوز دریافت روی دستگاه واقعی تأیید نشده است. حساب Apple Developer موجود نیست. Web Push فعلی مستقل است و کار می‌کند. ساخت قبلی macOS با امضای ad-hoc، صلاحیت APNs ندارد.

## پیش‌نیازها

1. یک پروژهٔ Firebase بسازید؛ Cloud Messaging در طرح رایگان ارائه می‌شود. اپ اندروید با شناسهٔ `ir.poshtetgarm.poshtetgarm_hybrid` را ثبت کنید.
2. برای مک، اپ Apple با شناسهٔ `ir.poshtetgarm.poshtetgarmHybrid` ثبت شود. حساب Apple Developer، App ID با Push Notifications، گواهی و provisioning profile معتبر لازم است. کلید APNs را در تنظیمات Cloud Messaging پروژهٔ Firebase وارد کنید. Release از محیط `production` و Debug/Profile از `development` استفاده می‌کند.
3. حساب سرویس با دسترسی ارسال FCM بسازید. در GitHub مخزن `all_in_one`، مسیر Settings → Environments → production → Add environment secret، نام `FCM_SERVICE_ACCOUNT_JSON` را وارد و کل JSON خصوصی حساب سرویس را به‌عنوان مقدار ذخیره کنید. مرحلهٔ Start release این secret را فقط در محیط اجرا به Compose و سپس API می‌دهد؛ در checkout یا خروجی ساخت ذخیره نمی‌شود. فایل کلید را در مخزن، Flutter، فایل عمومی، چت یا لاگ قرار ندهید. فایل محلی یا خروجی ساخت با SSH/SCP/rsync منتقل نشود. نبودن این secret اعلان بومی را خاموش نگه می‌دارد و روی VAPID/PWA تأثیر ندارد. پس از افزودن یا تغییر secret، فرایند Deploy را دوباره اجرا کنید.
4. تنظیمات **عمومی اپ Firebase** را در فایل محلی `firebase.android.json` یا `firebase.macos.json` در پوسته قرار دهید. فایل نمونه در پوسته موجود است؛ هر پلتفرم `appId` خودش را دارد. این فایل کلید حساب سرویس نیست.

```sh
flutter build apk --release --dart-define-from-file=firebase.android.json
flutter build macos --release --dart-define-from-file=firebase.macos.json
```

در Xcode تیم و signing identity معتبر را انتخاب کنید و Code Signing Entitlements را برای Debug/Profile روی `Runner/DebugProfilePush.entitlements` و برای Release روی `Runner/ReleasePush.entitlements` بگذارید. این الگوها قابلیت APNs را اضافه می‌کنند؛ ساخت عادی، برای سالم‌ماندن اجرای ad-hoc بدون حساب اپل، همچنان از entitlementهای بدون Push استفاده می‌کند. عضویت اپل و کلید APNs از کد قابل تولید نیستند. اندروید به Google Play Services سازگار نیاز دارد. ساخت بدون فایل تنظیمات مجاز است، ولی درخواست فعال‌سازی، نبودن تنظیمات اعلان را صریحاً گزارش می‌کند.

## قرارداد اتصال و ایمنی

- `PUT /api/push/native/subscription`: `{ platform: "ANDROID" | "MACOS", token }`. فقط با نشست احرازشده. پاسخ شامل endpoint هش‌شدهٔ `native:<sha256>` است؛ توکن در پاسخ یا لاگ بازگردانده نمی‌شود.
- `POST /api/push/test` و `/api/push/unsubscribe` همان endpoint را می‌پذیرند و دسترسی مالک را کنترل می‌کنند. ثبت توکن متعلق به حساب دیگر رد می‌شود.
- خروج از حساب اول ثبت سرور را پاک و سپس توکن بومی را حذف می‌کند. توکن‌های منقضی از سرور حذف می‌شوند؛ خطاهای موقت برای تلاش بعدی باقی می‌مانند. تغییر رمز/نسخهٔ نشست، ارسال دستگاه‌های نشست قدیمی را متوقف می‌کند.
- پوسته توکن تازه را پس از بازشدن اپ/تغییر توکن دوباره همگام می‌کند. توکن تازه جای endpoint قبلی را می‌گیرد. توکن از طریق JavaScript Channel به API ارسال نمی‌شود؛ درخواست API در صفحه با کوکی HttpOnly انجام می‌شود.
- پل فقط برای origin دقیق `https://poshtetgarm.ir` فعال است. nonce تصادفی در closure فریم اصلی، iframeهای خارجی را از استفادهٔ پل منع می‌کند. لمس اعلان فقط مقصد `/app/…` در همین origin را باز می‌کند.
- پیام notification+data باعث نمایش پس‌زمینه توسط سیستم‌عامل می‌شود. Android در foreground از اعلان محلی کانال `reminders` استفاده می‌کند؛ macOS از ارائهٔ foreground در APNs. وعدهٔ تحویل در ساعت دقیق/در حالت force-stop داده نمی‌شود؛ محدودیت‌های سیستم‌عامل و شبکه برقرار است.

## تأیید پیش از انتشار بومی

مجوز داده‌شده/ردشده، اعلان آزمایشی در foreground و background و پس از بسته‌شدن اپ، لمس اعلان، چرخش توکن، قطع شبکه، خروج و ورود با حساب دیگر و هر سه نوع یادآوری باید روی دستگاه واقعی بررسی شوند. تست‌های خودکار بدون حساب سرویس، اعتبارسنجی، مالکیت توکن، انتخاب FCM، حذف توکن منقضی و لینک‌های امن را بررسی می‌کنند؛ جای آزمون تحویل واقعی را نمی‌گیرند.

منابع: [راه‌اندازی FCM در Flutter](https://firebase.google.com/docs/cloud-messaging/flutter/get-started)، [دریافت پیام](https://firebase.google.com/docs/cloud-messaging/flutter/receive-messages)، [هزینهٔ Firebase](https://firebase.google.com/pricing)، [فعال‌سازی Push در Xcode](https://help.apple.com/xcode/mac/current/en.lproj/devdfd3d04a1.html).
