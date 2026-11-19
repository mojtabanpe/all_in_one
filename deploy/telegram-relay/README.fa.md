# رلهٔ تلگرام (دستور ۱۶۸)

سرور در ایران به `api.telegram.org` نمی‌رسد. این Worker کلودفلر درخواست‌های ربات را عیناً به تلگرام می‌رساند و
چیزی ذخیره نمی‌کند (نه توکن، نه پیام). فقط درخواستی را می‌پذیرد که هدر `x-relay-key` درست داشته باشد.

## قدم‌ها (با مالک)

1. **ربات:** در BotFather یک ربات تازه بساز (مثلاً `@poshtetgarm_bot`). توکن و نام کاربری را نگه دار.
2. **رله:** در حساب Cloudflare، داخل همین پوشه:
   ```bash
   npx wrangler deploy
   ```
   ```bash
   npx wrangler secret put RELAY_KEY
   ```
   برای `RELAY_KEY` یک مقدار تصادفی بلند بده (مثلاً خروجی `openssl rand -hex 32`).
   `workers.dev` در ایران ممکن است فیلتر باشد؛ بهتر است Worker روی یک زیردامنهٔ دامنه‌ای در Cloudflare
   (Custom Domain) باشد.
3. **آزمایش از سرور (فقط‌خواندنی):** از سرور، درخواست `getMe` از راه رله باید `"ok":true` برگرداند.
4. **env سرور** (`/opt/all-in-one/shared/.env`، با اجازهٔ مالک مثل دستورهای ۸۱ و ۱۱۵؛ مقدارها چاپ نشوند):
   `TELEGRAM_BOT_TOKEN`، `TELEGRAM_BOT_USERNAME`، `TELEGRAM_WEBHOOK_SECRET` (تصادفی، دست‌کم ۲۴ نویسه)،
   `TELEGRAM_API_URL` (آدرس رله) و `TELEGRAM_RELAY_KEY`.
5. **وب‌هوک:** اگر تلگرام مستقیم به `poshtetgarm.ir` می‌رسد، وب‌هوک را روی
   `https://poshtetgarm.ir/api/telegram/webhook` بگذار؛ وگرنه روی `<آدرس رله>/webhook`. در هر دو حالت
   `secret_token` همان `TELEGRAM_WEBHOOK_SECRET` است (`setWebhook` با `allowed_updates: ["message","callback_query"]`).
6. در اپ: «حساب کاربری ← تلگرام ← وصل به تلگرام»، Start در ربات، یک پیام آزمایشی.
