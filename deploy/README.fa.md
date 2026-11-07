# استقرار «Poshtetgarm» روی poshtetgarm.ir

این اپ جای Recall را روی `poshtetgarm.ir` می‌گیرد. حساب‌های انتخاب‌شده Recall با دسته‌ها، کارت‌ها و متن‌هایشان با `deploy/import-recall.sh <email>...` منتقل می‌شوند (رمزها همان می‌مانند).

هر push روی `master` پس از سبز شدن CI خودکار دیپلوی می‌شود (`.github/workflows/deploy.yml`): ایمیج‌ها روی GitHub ساخته و در GHCR (`ghcr.io/mojtabanpe/all-in-one-{api,public,web}:<commit>`) push می‌شوند، runner سرور (`aio-server`) آن‌ها را pull می‌کند و با `deploy/release.sh` بالا می‌آورد و اگر سالم نبودند به نسخه قبلی برمی‌گردد.

### انتقال ایمیج‌ها به سرور

- **مسیر اصلی: GHCR.** سرور فقط لایه‌هایی را می‌گیرد که ندارد. `node_modules` در مرحلهٔ جدای `deps` در `deploy/images.dockerfile` ساخته می‌شود، پس لایهٔ بزرگ api تا وقتی `pnpm-lock.yaml` عوض نشده یکسان می‌ماند و در هر انتشار فقط لایه‌های کوچک برنامه منتقل می‌شوند (پیش‌تر کش‌های ساخت در `node_modules/.cache` این لایه را هر بار عوض می‌کردند و هر دیپلوی کل ۴۴۶ مگابایت را دوباره می‌کشید). Docker چکیدهٔ هر لایه را بررسی می‌کند، لایه‌های تمام‌شده روی سرور می‌مانند و هر `docker pull` تا سه بار (هر بار حداکثر ۲۰ دقیقه) تکرار می‌شود. ورود به GHCR با `GITHUB_TOKEN` همان اجرا و در یک `DOCKER_CONFIG` موقت است؛ هیچ رمزی روی سرور یا در مخزن ذخیره نمی‌شود. گام «Report image sizes» در job ساخت، حجم فشردهٔ هر ایمیج و لایه‌هایش را چاپ می‌کند. GHCR برای هر ایمیج ۱۵ نسخهٔ آخر را نگه می‌دارد.
- **مسیر جایگزین: artifact.** اگر pull از GHCR شکست بخورد، job `bundle` روی GitHub هر ایمیج را جدا (`image-api`، `image-public`، `image-web`) آپلود می‌کند و `deploy/fetch-images.sh` روی سرور آن‌ها را با curl دانلود می‌کند: ادامه از جای قطع‌شده (`-C -`)، قطع و تکرار انتقالی که ۶۰ ثانیه کندتر از ۲۰ KB/s باشد، تا ۱۰ بار تلاش، و بررسی SHA-256 و سالم بودن gzip پیش از `docker load`. فایل ناقص هیچ‌وقت به Docker نمی‌رسد (۱۵ آبان ۱۴۰۵ `download-artifact` فایل بریده را موفق گزارش کرده بود).
- اجرای دوباره همان انتشار: Actions ← Deploy ← Run workflow.

نسخهٔ برنامه در حساب کاربری، کنار تنظیم زبان نمایش داده می‌شود. نسخهٔ پایه در `package.json` است؛ گردش‌کار Deploy پیش از ساخت ایمیج‌ها با `tools/scripts/write-app-version.mjs` شمارهٔ اجرای همان انتشار را به پچ پایه اضافه و در خروجی برنامه ثبت می‌کند. برای نمونه، پایهٔ `0.1.0` در اجرای ۴۲ نسخهٔ `0.1.42` می‌شود. اجرای مجدد همان انتشار نسخه را تغییر نمی‌دهد؛ انتشارهای بعدی پچ بزرگ‌تری می‌گیرند. انتشار ناموفق ممکن است باعث پرش شماره شود. برگشت به ایمیج قبلی، نسخهٔ همان ایمیج را نمایش می‌دهد. برای تغییر major/minor، نسخهٔ پایه و مقدار توسعه در `libs/web/shared/src/lib/release-version.ts` را با هم تغییر دهید.

| مسیر                                                                             | چه چیزی                           | پورت محلی                |
| -------------------------------------------------------------------------------- | --------------------------------- | ------------------------ |
| `/`                                                                              | سایت معرفی (Angular SSR)          | `127.0.0.1:4322`         |
| `/app/`                                                                          | اپ کاربر (PWA، قابل نصب روی گوشی) | فایل ثابت در کانتینر web |
| `/admin/`                                                                        | پنل مدیر                          | فایل ثابت در کانتینر web |
| `/api/` و `/authorize`، `/token`، `/register`، `/revoke`، `/.well-known/oauth-*` | api و اتصال ChatGPT               | `127.0.0.1:4321`         |

کانتینر `web` (nginx) روی `127.0.0.1:4320` همه این مسیرها را پخش می‌کند. Nginx خود سرور فقط HTTPS را می‌گیرد و همه چیز را به آن می‌فرستد. Postgres روی `127.0.0.1:15433` و Redis روی `127.0.0.1:16380` است. هیچ‌کدام از این پورت‌ها عمومی نیستند. هوش مصنوعی را هر کاربر خودش در «حساب کاربری ← هوش مصنوعی» تنظیم می‌کند (نشانی OpenAI-compatible گفتگو، متن به گفتار و گفتار به متن). اگر بخواهید کاربران از 9Router همین سرور (`http://127.0.0.1:20128/v1`) استفاده کنند، `AI_ALLOW_PRIVATE_URLS=true` بگذارید؛ برای همین api با شبکه میزبان اجرا می‌شود. روی سروری با کاربران ناشناس آن را `false` نگه دارید.

## ۱. پوشه‌ها و تنظیمات خصوصی

```sh
sudo install -d -m 750 -o recall-deploy -g recall-deploy /opt/all-in-one /opt/all-in-one/shared
cp deploy/.env.example /opt/all-in-one/shared/.env          # JWT_SECRET، AI_KEYS_SECRET و SMTP_URL را پر کنید
cp deploy/compose.env.example /opt/all-in-one/shared/compose.env   # رمز Postgres
chmod 600 /opt/all-in-one/shared/.env /opt/all-in-one/shared/compose.env
```

- `JWT_SECRET`: دست‌کم ۳۲ نویسه تصادفی (`openssl rand -base64 48`).
- `SMTP_URL`: برای بازیابی رمز و تأیید ایمیل هنگام ثبت‌نام لازم است. بدون آن، ثبت‌نام در حالت production خطای «ایمیل در دسترس نیست» می‌دهد.
- `AI_KEYS_SECRET`: کلید رمزگذاری کلیدهای هوش مصنوعی کاربران (`openssl rand -base64 32`). اگر عوض شود، کاربران باید کلیدهایشان را دوباره وارد کنند.

## ۲. ساخت ایمیج‌ها

بهتر است روی CI یا مک ساخته و به سرور فرستاده شوند (سرور کوچک است):

```sh
RELEASE=$(git rev-parse --short HEAD)
for t in api public web; do
  docker build -f deploy/images.dockerfile --target $t -t all-in-one-$t:$RELEASE .
done
docker save all-in-one-api:$RELEASE all-in-one-public:$RELEASE all-in-one-web:$RELEASE | gzip > aio-$RELEASE.tar.gz
scp aio-$RELEASE.tar.gz recall-deploy@194.48.198.106:/opt/all-in-one/
ssh recall-deploy@194.48.198.106 "gunzip -c /opt/all-in-one/aio-$RELEASE.tar.gz | docker load"
```

## ۳. اجرا

```sh
cd /opt/all-in-one/src   # یک نسخه از مخزن (فقط برای compose.yml)
RELEASE=<commit> docker compose -f deploy/compose.yml --env-file /opt/all-in-one/shared/compose.env up -d
docker compose -f deploy/compose.yml ps
curl -s http://127.0.0.1:4320/api/health
```

api هنگام شروع، migrationهای Prisma را با `prisma migrate deploy` اجرا می‌کند. برای حساب مدیر، اول در `/app/` عادی ثبت‌نام کنید و ایمیل را تأیید کنید، بعد نقشش را عوض کنید:

```sh
docker compose -f deploy/compose.yml exec postgres psql -U aio all_in_one -c "UPDATE users SET role='ADMIN' WHERE email='you@example.com';"
```

## ۴. جابه‌جایی از Recall

1. از دیتابیس Recall یک بکاپ نهایی بگیرید (برای بایگانی؛ منتقل نمی‌شود).
2. `deploy/nginx.conf` را جای server block فعلی `poshtetgarm.ir` بگذارید (گواهی همان قبلی است)، سپس:
   ```sh
   sudo nginx -t && sudo systemctl reload nginx
   ```
3. Recall را خاموش کنید: `docker compose -p recall stop app`. پایگاه‌داده و Redis آن کاری به این اپ ندارند و پورت‌هایشان (15432، 16379) با این اپ تداخل ندارد.
4. اتصال ChatGPT قبلی (Recall) دیگر کار نمی‌کند. در اپ، «حساب کاربری ← اتصال به ChatGPT» یک کلید تازه بسازید و در ChatGPT اتصال را با نشانی `https://poshtetgarm.ir/api/mcp` از نو بسازید ([docs/chatgpt-mcp.md](../docs/chatgpt-mcp.md)).
5. کسانی که Recall را روی گوشی نصب کرده بودند، اپ تازه را از `https://poshtetgarm.ir/app/` نصب کنند.

## ۵. بکاپ

```sh
docker compose -f deploy/compose.yml exec -T postgres pg_dump -U aio -Fc all_in_one > /opt/all-in-one/backups/aio-$(date +%F).dump
```

## نکته‌ها

- کانتینرها فقط روی loopback گوش می‌دهند (`API_HOST`، `HOST`، `listen 127.0.0.1:4320`).
- `NG_ALLOWED_HOSTS` باید دامنه باشد؛ وگرنه سایت SSR پاسخ 400 می‌دهد.
- Service worker فقط در `/app/` کار می‌کند و درخواست‌های `/api` را کش نمی‌کند. `index.html`، `ngsw.json` و `ngsw-worker.js` با `no-cache` سرو می‌شوند تا نسخه تازه زود برسد و نوار «نسخه تازه آماده است» نشان داده شود.
