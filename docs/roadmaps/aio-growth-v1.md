# AIO Growth v1 — رودمپ مارکتینگ و درآمد پشت‌گرم

**Domain:** https://poshtetgarm.ir  
**Market:** Iran; Persian-speaking users  
**Business model:** Freemium; AI features available only with paid entitlement  
**Scope:** `apps/public`, `apps/customer`, `apps/admin`, API, billing, AI, analytics.  
**Status:** Planning. Code-based Growth Audit performed 2026-11-06; no implementation completed by this roadmap. Production website and performance not independently verified.

## North star and KPIs
North star: users completing meaningful activity on 3 separate days in their first 7 days.
Track landing-to-signup, signup-to-first-action, D1/D7/D30 retention, PWA installs, AI trial/paywall conversion, payment success, churn, CAC, LTV, revenue, AI cost per subscriber. Segment by UTM campaign, acquisition channel, cohort and selected first goal. Avoid sending task content, medical details, keys or passwords to analytics.

## P0 — acquisition readiness (first sprint)
- [ ] `TODO` Make landing hero communicate value in 5 seconds; clear free CTA, product screenshots, how-it-works, trust/privacy, mobile layout. Evidence: `apps/public/src/app/pages/home.ts` currently says «روزهای شلوغ. یک جای خلوت.»
- [ ] `TODO` Send marketing CTA to registration mode directly; preserve safe internal redirect/UTMs. Evidence: `libs/web/shared/src/lib/auth/login-page.ts` initializes mode to `login`; public CTA uses `CUSTOMER_APP_URL` in `apps/public/src/app/pages/home.ts`.
- [ ] `TODO` Implement consent-aware privacy-respecting analytics, attribution and funnel dashboards. Events: `landing_view`, `signup_started`, `signup_completed`, `first_task_created`, `first_review_completed`, `pwa_install_prompt`, `pwa_installed`, `paywall_viewed`, `checkout_started`, `payment_verified`, `subscription_started`, `subscription_expired`. Server-side payment verification is authoritative. No analytics integration confirmed in reviewed public/customer bootstrap.
- [ ] `TODO` Add unique title/meta description/canonical/OG/social previews, structured data as applicable, sitemap, robots, Search Console verification. Evidence: `apps/public/src/index.html`, `apps/public/src/app/app.routes.ts`; `app.routes.server.ts` prerenders routes.
- [ ] `VERIFY` Test actual production HTTP/SEO, indexing, Core Web Vitals, registration email flow, mobile UX; source inspection alone cannot establish production behavior.

## P1 — product activation and retention
- [ ] `TODO` Goal-based onboarding: planner vs English vs health; route to first successful action; track activation.
- [ ] `TODO` First-week reminders with explicit opt-in, user controls, local timezone, rate limits and quiet hours; verify existing push implementation before changing it.
- [ ] `TODO` Weekly progress digest, return-to-app links, cohort retention and churn dashboard.
- [ ] `VERIFY` PWA install/update on Android Chrome and iOS Safari. Evidence: `apps/customer/src/app/pwa.ts`, `apps/customer/public/manifest.webmanifest`, `apps/customer/ngsw-config.json`. Test safe reload/update behavior and `/app/` deployment paths.
- [ ] `TODO` SEO-specific landing pages for Persian daily planning, Leitner flashcards, daily English routine.

## P1 — admin growth and commercial dashboard (existing admin, extend it)
Evidence: `apps/admin/src/app/pages/dashboard.ts` already shows basic user/content stats via `/admin/stats`. Do not build a duplicate dashboard.
- [ ] `TODO` Extend dashboard with signups, cohorts, DAU/WAU/MAU, D1/D7/D30 retention, funnel, UTM channels, conversions, paid users, MRR, refunds, failed payments, AI usage/cost, alerts.
- [ ] `TODO` Add date range, filters, export, access controls, audit logging and safe aggregated metrics.
- [ ] `TODO` Admin subscription/customer support views (entitlement, invoices, payment status, manual adjustments with audit trail).
- [ ] `TODO` Admin-only global AI provider settings, health checks, budgets, quotas, model/provider fallback and monitoring.

## P1 — Iranian payment gateway and Freemium
- [ ] `TODO` Select and validate an Iranian PSP/aggregator contract, settlement, fees, sandbox, callbacks and regulatory requirements. Do not assume a provider is available.
- [ ] `TODO` Design plans/prices/currency (IRT vs IRR explicitly), monthly/annual durations, subscription lifecycle, entitlements and invoices.
- [ ] `TODO` Implement server-side checkout creation, signed/verified callbacks, idempotency, transactional activation, replay protection, expiration, retries, refunds and reconciliation. Never grant paid access from client redirect alone.
- [ ] `TODO` Add upgrade/paywall UI and subscription management; free core planner/flashcards/health remain useful.
- [ ] `TODO` Test success, cancellation, timeout, duplicate callback, amount mismatch, renewal/expiration, refund and payment-provider outage.

## P0/P1 — replace user AI configuration with one reliable managed service
Evidence: `libs/web/shared/src/lib/auth/ai-settings.ts` currently allows users to enter their own chat/TTS/STT URL, model, key and proxy; inspect all consumers, API routes, DB schemas and account page before removal.
- [ ] `TODO` Inventory all AI calls (chat, flashcards, coaching, TTS, STT, assistant), legacy BYOK settings and failure behavior.
- [ ] `TODO` Remove **customer-facing AI provider configuration UI**, not unrelated account, MCP/ChatGPT integration, or user privacy controls. Plan migration/deprecation of encrypted user keys; never silently reuse user-supplied keys as global credentials.
- [ ] `TODO` Implement centralized **server-side** provider configuration managed by admins only: per capability chat/TTS/STT, secret manager or encrypted server store, health checks, timeouts, retries, circuit breaker, fallback, budget caps, logs without sensitive payloads. No secret exposure in client or admin API responses.
- [ ] `TODO` Enforce **paid entitlement server-side for every AI endpoint** and streaming/MCP path where relevant; unpaid/expired users receive clear upgrade response. Admin overrides only with audit. Protect against direct API bypass.
- [ ] `TODO` Define per-plan AI quotas and rate limits to control cost, including audio duration, token budgets, concurrency and abuse controls; show remaining allowance.
- [ ] `TODO` Make all customers use managed defaults (no per-user provider settings); preserve only relevant per-user preferences (e.g., language/voice) if needed.
- [ ] `TODO` Rollout behind feature flag, test provider outage and subscription expiration, verify migration and key deletion policy.

## 90-day marketing experiments (after P0 instrumentation)
- Days 1–14: 20 user interviews, baseline funnel, landing/signup fixes.
- Days 15–30: 7-day English challenge and daily-planning template; target 100 initial signups as **experiment goal**, not forecast.
- Days 31–60: Telegram niche channel partnerships, short-form Instagram demonstrations, SEO content, referral experiment; track attributed activated users and CAC.
- Days 61–90: double down on highest-retention channel; test freemium plan/price with actual users; measure paid conversion, refunds and AI unit economics.
- Budget hypothesis: up to 10m toman first month only after attribution and activation measurement; adjust from observed CAC.

## Dependencies / recommended sequence
1. Measurement + registration + clear value proposition.
2. Admin metrics and first-action onboarding.
3. Managed AI architecture + entitlement enforcement + quotas **before** paid AI launch.
4. Payment provider integration and verified purchase lifecycle.
5. Campaigns and retention experiments; iterate with cohort data.

## Completion criteria
P0: production landing/signup flow works, analytics funnel validated, no high-impact SEO errors, tested PWA and clear user onboarding.
Monetization: verified gateway callbacks, paid-only AI enforced on server, provider credentials server-only, costs bounded, refunds/expiry tested, admin dashboard reflects payments.
Last updated: 2026-11-06. No code modified as part of this plan.
