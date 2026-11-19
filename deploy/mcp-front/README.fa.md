# ورودی Cloudflare برای اتصال ChatGPT و Claude

از اواسط آبان ۲۰۲۶ سرورهای OpenAI و Anthropic به `poshtetgarm.ir` نمی‌رسند (آخرین درخواست OpenAI ۵ آبان، Anthropic
۱۱ آبان)، ولی Cloudflare می‌رسد. این Worker فقط مسیرهای MCP و OAuth را عیناً به سایت می‌رساند و چیزی ذخیره نمی‌کند:
`/api/mcp`، `/api/mcp/consent`، `/authorize`، `/token`، `/register`، `/revoke` و سه آدرس `/.well-known/…`.
مسیرهای دیگر (از جمله `/api/mcp/keys` که کوکی ورود می‌خواهد) ۴۰۴ می‌گیرند.

- آدرس: `https://poshtetgarm-mcp.memnpe.workers.dev`
- استقرار: در همین پوشه `npx wrangler deploy`.
- سرور: `MCP_PUBLIC_URL` در `deploy/compose.yml` روی آدرس این Worker است (مقدار env سرور را بی‌اثر می‌کند)، تا آدرس سرور
  در کارت «اتصال به ChatGPT و Claude» و اطلاعات OAuth به این ورودی اشاره کنند. اتصال‌های OAuth قبلی یک بار دوباره
  وصل می‌شوند؛ توکن‌های شخصی همان می‌مانند.
