# Poshtetgarm Colab Runner (`tools/colab`)

زیرساخت قابل استفاده مجدد برای اجرای کارهای **دسته‌ای (Batch)، مدیا و GPU-محور** روی **Google Colab** بدون دانلود مدل‌های سنگین روی لپ‌تاپ.

> **قانون مهم:** Colab فقط برای کارهای آفلاین/دسته‌ای (ساخت صوت TTS، زیرنویس Whisper، پردازش ویدیو، تست مدل‌ها و ساخت دیتاست) یا تست موقت dev است — نه برای سرویس زنده ۲۴/۷ (Production).

## ساختار پوشه

```
tools/colab/
├── README.md                      # همین راهنما
├── runner.ipynb                   # نوت‌بوک اصلی (یک بار روی Colab آپلود یا در Drive ذخیره می‌شود)
├── export-starter-tts-input.mjs   # استخراج خودکار لیست متن‌های دک‌های استارتر زبان به JSON
└── jobs/
    ├── _template.py               # الگوی استاندارد برای اضافه کردن job جدید
    └── kokoro_tts.py              # تولید دسته‌ای MP3 (و حالت تست زنده /v1/audio/speech) با Kokoro
```

## نحوه استفاده

### ۱. ساخت فایل ورودی (مثلاً برای دک‌های استارتر زبان)

```bash
node tools/colab/export-starter-tts-input.mjs /tmp/starter-tts-input.json
```

این اسکریپت همه لغت‌ها و تعریف‌های دک‌های استارتر (`daily-life-sample.ts` و `starter-data.ts`) را به صورت JSON استاندارد خروجی می‌دهد.

### ۲. اجرا روی Google Colab

1. فایل `tools/colab/runner.ipynb` را یک بار در [Google Colab](https://colab.research.google.com/) باز کن (و در Google Drive ذخیره کن تا همیشه در دسترس باشد).
2. **سلول ۱:** بررسی GPU/CPU و مونت اختیاری Google Drive.
   - اگر `MOUNT_DRIVE = True` باشد، مدل‌ها در `/content/drive/MyDrive/poshtetgarm-colab/cache` ذخیره می‌شوند تا در اجراهای بعدی دوباره دانلود نشوند.
3. **سلول ۲:** آپلود اسکریپت `jobs/<job>.py` و فایل ورودی (`input.json` یا ویدیو/صوت) به `/content/work/`.
4. **سلول ۳:** اجرای job با آرگومان‌های استاندارد (`--input`، `--output`، `--cache-dir`).
5. **سلول ۴:** دانلود خودکار فایل خروجی (`output.zip`) و کپی اختیاری آن در Google Drive.

### مثال اجرای `kokoro_tts.py` روی Colab

```bash
python /content/work/kokoro_tts.py \
  --input /content/work/starter-tts-input.json \
  --output /content/work/poshtetgarm_starter_tts_af_bella.zip \
  --cache-dir /content/colab_cache \
  --voice af_bella \
  --speed 0.95
```

برای تست موقت زنده با اپ dev لوکال (ساخت endpoint `/v1/audio/speech` با `cloudflared`):

```bash
python /content/work/kokoro_tts.py --serve --cache-dir /content/colab_cache --voice af_bella
```

## اضافه کردن Job جدید

1. از `tools/colab/jobs/_template.py` یک کپی با نام دلخواه بگیر (مثلاً `jobs/reel_subtitles.py`).
2. قرارداد CLI استاندارد را حفظ کن: `--input`، `--output`، `--cache-dir`.
3. پکیج‌های مورد نیاز را در ابتدای اسکریپت با `ensure_packages([...])` نصب کن تا نوت‌بوک `runner.ipynb` برای همه jobها بدون تغییر کار کند.
