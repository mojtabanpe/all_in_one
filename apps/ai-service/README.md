# Poshtetgarm Standalone AI Service (`apps/ai-service`)

سرویس مستقل مسیریابی هوش مصنوعی (جدا از `apps/api`) با API سازگار با OpenAI (`/v1/chat/completions`, `/v1/models`, `/health`).

## معماری

```
apps/api (AiGateway)
   │  (فقط وقتی AI_SERVICE_ENABLED=true یا از طریق Preset ادمین)
   ▼
apps/ai-service (127.0.0.1:4395)
   ├── DeepSeek (پیش‌فرض؛ وقتی AI_SELF_HOSTED_ENABLED=false فقط همین فعال است)
   └── Self-hosted llama-server (127.0.0.1:8085، Qwen2.5-1.5B-Instruct GGUF Q4_K_M)
```

- **پیش‌فرض امن:** `AI_SELF_HOSTED_ENABLED=false` و `AI_SERVICE_ENABLED=false`. تا وقتی خودتان روشن نکنید، هیچ تغییری روی ترافیک DeepSeek فعلی ایجاد نمی‌شود.
- **حالت‌های `AI_SELF_HOSTED_MODE` (وقتی `AI_SELF_HOSTED_ENABLED=true`):**
  - `fallback` (پیش‌فرض): اول DeepSeek را صدا می‌زند؛ در صورت خطای شبکه، تایم‌اوت، `429`، `5xx` یا `401/402/403/404` به‌صورت خودکار درخواست را به `llama-server` می‌فرستد.
  - `primary`: مستقیماً درخواست‌ها را به `llama-server` می‌فرستد (مناسب برای تست کیفیت مدل فاین‌تیون‌شده).
- هر پاسخ هدرهای `X-AI-Provider` (`deepseek` یا `self-hosted`) و `X-AI-Fallback` (`true`/`false`) را برمی‌گرداند.

## اجرای محلی / روی سرور

```bash
pnpm nx serve ai-service
```

یا بیلد و اجرا:

```bash
pnpm nx build ai-service
node dist/apps/ai-service/main.js
```

## اجرای `llama-server` روی سرور `ssh flashcard` (2 vCPU، 2.2Gi رم آزاد)

پس از ساخت فایل GGUF روی Google Colab (`poshtetgarm-qwen2.5-1.5b-q4_k_m.gguf`) و انتقال آن به سرور:

```bash
llama-server \
  -m /opt/models/poshtetgarm-qwen2.5-1.5b-q4_k_m.gguf \
  --host 127.0.0.1 \
  --port 8085 \
  --ctx-size 2048 \
  --threads 2 \
  --parallel 1 \
  --jinja \
  --alias poshtetgarm-qwen2.5-1.5b
```

- مصرف رم کل حدود `1.4 GB` است (`ctx=2048`، `Q4_K_M` ≈ `1.1 GB`) و با `2 vCPU` و `--parallel 1` به Postgres / Node / Docker فشار نمی‌آورد.
- فلگ `--jinja` پشتیبانی رسمی از OpenAI Tool Calling را در `llama-server` برای Qwen2.5 فعال می‌کند.

## اتصال `apps/api` به `ai-service`

دو راه تمیز وجود دارد (هر دو بدون درهم‌تنیدگی کد):

1. **از طریق `.env` در `apps/api` (پیش‌فرض خاموش):**
   ```env
   AI_SERVICE_ENABLED=true
   AI_SERVICE_URL=http://127.0.0.1:4395/v1
   AI_SERVICE_TOKEN=<same-as-ai-service>
   AI_SERVICE_MODE=fallback   # یا primary برای تست مستقیم
   ```
2. **از طریق پنل ادمین (`/admin/ai`):**
   با `AI_ALLOW_PRIVATE_URLS=true`، آدرس `http://127.0.0.1:4395/v1` را به عنوان Preset ذخیره کنید و به عنوان Fallback (یا Primary) برای Chat انتخاب کنید.
