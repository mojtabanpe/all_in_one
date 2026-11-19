# پوستهٔ بومی Poshtetgarm

کد قابل ساخت پوستهٔ Android و macOS در این پوشه نگهداری می‌شود. این پوشه تنها منبع پوسته است (دستور ۱۵۵). نسخهٔ موجود در `/Users/mojtabanpe/Projects/personal/hybrid/Poshtetgarm` قدیمی است (1.0.2، بدون پرداخت استور) و نباید از آن ساخته یا در آن ویرایش شود.

## ساخت اندروید

گردش‌کار **Android APK** در GitHub، Flutter 3.47.6 و Java 17 را نصب می‌کند، تحلیل و تست‌ها را اجرا و APK را در Artifacts همان اجرا ذخیره می‌کند. اجرا با تغییر این پوشه یا دکمهٔ Run workflow ممکن است. ساخت محلی:

```sh
flutter pub get
sh scripts/build-android.sh
```

اسکریپت تنظیم Dart را از `android/app/google-services.json` تولید می‌کند تا پیکربندی Dart و منابع بومی Android یکسان باشند. این فایل فقط تنظیمات عمومی اپ Firebase است و طبق مستندات Firebase محرمانه نیست. هیچ کلید حساب سرویس، کلید امضای انتشار یا مسیر SDK محلی در مخزن نیست.

خروجی: `build/app/outputs/flutter-apk/app-release.apk`. بیلد محلی بدون `ANDROID_KEYSTORE_PATH` با کلید debug امضا می‌شود و فقط برای آزمون است. در GitHub هر سه flavor (`direct`، `bazaar`، `myket`) از ۱.۰.۶ با کلید انتشار ثابت (secrets `ANDROID_KEYSTORE_*`) امضا می‌شوند تا هر نسخه روی قبلی نصب شود.

## اعلان

Firebase: `poshtetgarm`، Android package: `ir.poshtetgarm.poshtetgarm_hybrid`.

فعال‌سازی از «حساب کاربری ← اعلان‌ها» است. سرور از GitHub Environment secret به نام `FCM_SERVICE_ACCOUNT_JSON` استفاده می‌کند؛ این کلید هرگز داخل فایل نصب نیست. یادآوری تسک، عادت و مرور زبان مشترک با PWA است. تست روی گوشی واقعی در foreground، background و لمس اعلان، پس از نصب APK لازم است.

مک بدون عضویت Apple Developer و APNs، پوش بومی واقعی نمی‌گیرد. ساخت عادی مک ad-hoc باقی می‌ماند؛ الگوهای `DebugProfilePush.entitlements` و `ReleasePush.entitlements` فقط پس از تنظیم حساب و provisioning معتبر استفاده می‌شوند. PWA مستقل کار می‌کند.

راهنمای سرور و فعال‌سازی: [native-push.md](../../docs/native-push.md).
