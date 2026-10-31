# zimara-menu

نظام زيمارا للمطاعم والمقاهي: منيو إلكتروني، وبيجر ذكي يحوّل جوال العميل إلى بيجر وينبّهه بصوت، وبطاقات ولاء رقمية. لوحة تحكم بـ4 حسابات إدارية لزيمارا، وحساب مالك لكل منشأة، وحساب لكل فرع. يبدأ موقعًا، ثم تطبيقًا على Android وiOS.

**ZIMARA Menu**: e-menu, a pager on the customer's phone, and loyalty cards, for restaurants and cafés. Runs on one Cloudflare Worker, separate from the zimara-website Worker and its databases. The public trial on zimara.co (`/منيو/تجربة`) stays in zimara-website; this repo is the commercial product.

## Retained phase 1 foundation

| Area | Behaviour |
| --- | --- |
| Accounts | Platform admins (hard cap 4), one owner per business, one account per branch. PBKDF2 passwords, HttpOnly session cookies, login rate limit, JSON-only mutations (CSRF), audit log. Every query is scoped to the caller's business/branch. |
| Menu | Categories and items (AR/EN, price in halalas, calories, image URL). Branches mark items sold out. Public menu at `/m/<branch>` with search, plus a printable QR per branch. |
| Pager | Cashier enters the POS invoice number (or auto-numbers) and gets a per-order QR. Customer page `/t/<token>`: live status, sound + vibration, screen wake lock, Web Push. Ready → alert; repeats every 2 min up to 3 times until the customer taps "I saw it"; urgent re-alert button. "Seen" is separate from "collected". Rating, then the branch's Google review link (shown to everyone, no review gating). Front display with the latest QR and ready numbers. Open numbers are unique per branch; staff actions use optimistic versions so two screens never double-apply. |
| Loyalty | Customer gets a card at `/j/<business>` (no signup), shown at `/c/<token>` with a QR + 6-char code. Cashier scans or types the code to stamp or redeem. Append-only ledger; stamp/redeem is a single atomic SQL statement with an idempotency key, so retries never double-stamp and two redeems cannot overdraw. |
| Stats | Per branch, last 30 days: orders, collected, average/longest prep, pickup delay after the call, rating; loyalty totals. |

Original phase1 did not include paid subscriptions, vendor POS or Wallet. The continuation below adds trial/subscription state and an internal POS bridge; direct external integrations remain disabled. See [integration readiness](docs/INTEGRATIONS.md).

### Alert limits (honest version)

- Android Chrome can support Web Push on a locked phone after setup and permission; delivery/sound depend on the OS, settings and network.
- iPhone: Web Push needs iOS 16.4+ and the page added to the Home Screen; otherwise the page must stay open (it keeps the screen awake and chimes). Wallet requires separate credentials, implementation and real-device acceptance; it does not guarantee sound.
- No technology can alert a phone that is powered off.

## Layout

```
src/app.js        Hono routes: auth, admin, owner, branch, public, cron
src/auth.js       passwords, sessions, login rate limit
src/push.js       VAPID-signed, payload-less Web Push (allow-listed push hosts)
src/worker.js     fetch + scheduled entry
migrations/       D1 schema
public/           static pages (vanilla ES modules, RTL/LTR, light/dark)
scripts/          admin-create.mjs
test/             node:test API suite on node:sqlite; test/e2e browser journey
```

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars          # fill AUTH_SECRET and VAPID keys
npx web-push generate-vapid-keys --json # for the VAPID values
npm run db:migrate:local
ADMIN_EMAIL=root@zimara.test ADMIN_NAME=Root ADMIN_PASSWORD=local-pass-123 npm run admin:create
npm run dev                             # http://localhost:8787
npm test                                # API suite
node test/e2e/journey.mjs http://localhost:8787 /tmp/screens   # browser journey, needs Playwright
```

## Setup on Cloudflare

Done once by the owner or Codex; the code never creates infrastructure itself.

1. `npx wrangler d1 create zimara-menu-db` (and `zimara-menu-db-preview`), then put the ids in `wrangler.jsonc`.
2. `npx wrangler d1 migrations apply zimara-menu-db --remote`
3. Secrets: `npx wrangler secret put AUTH_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:...`).
4. `npx wrangler deploy` (includes the every-minute cron for repeat alerts).
5. `npm run admin:create -- --remote` for the first admin.
6. Optional: Custom Domain `menu.zimara.co`.

Never point this Worker at `zimara-platform` or `zimara-menu-trial`.

## Standalone review implementation — 31 October 2026

This continuation builds on PR #1, preserving its pager and loyalty lifecycle. It adds a bilingual branded marketing site, real isolated demo rooms, self-signup with14-day trials, per-tenant profiles, CSV import preview, optional server-priced orders, revocable counter-display credentials, TOTP/recovery controls, invoice/status views, an independently signed generic POS bridge, data export and deletion-request/card-revocation controls.

Start at `/` for the product, `/demo` for a synthetic room, `/register` for a trial, `/login` for accounts, `/app` for the role dashboard, `/p/{org}` for the public profile, `/m/{branch}` for public menu, and `/display/{token}` for a revocable device screen. The public menu/profile never include pager QR. Ready, seen and collected remain separate.

Run `npm test`, `npm run build`, `npm run build:preview`, and `npm run test:e2e -- http://127.0.0.1:8787`. E2E requires `npx playwright install chromium`; HTTP(S) proxy variables are honored for remote test targets. Apply all additive migrations before running. No production reset/seed is part of this continuation. Initial admin bootstrap remains an explicit setup command for a new environment; do not run it against the institutional account.

The public review is at https://zimara-menu-review-20261031.zimara-hq.workers.dev/ with an independent database. It is not a commercial launch. See [acceptance evidence](docs/ACCEPTANCE.md), [integration states](docs/INTEGRATIONS.md), [security review](docs/SECURITY-AUDIT.md), [competitor review](docs/COMPETITOR-REVIEW.md), [pricing assumptions](docs/PRICING.md), [compliance research](docs/COMPLIANCE.md), [inputs/scope](docs/INPUTS.md), and [rollback](docs/ROLLBACK.md).

### Honest operational limits

Moyasar subscription checkout and the Simple Fatoora invoice adapter are implemented, but both remain disabled until their Worker credentials and explicit environment flags are configured. The connected Simple Fatoora chat account does not grant this Worker API credentials. Direct Foodics/Rewaa/Odoo adapters, Wallet signing/issuance/updates, SMS/WhatsApp and native apps are not built. Existing Web Push needs VAPID setup and real-device tests; this review uses in-page alerts. R2 image/font endpoints exist and validate files, but account R2 enablement is required. The import workflow accepts CSV exported by Excel, not native XLSX. Admin model preserves the existing4-admin roles; separate super/impersonation is pending. Full account erasure, verified email delivery/password reset, legal identity and commercial acceptance still block a paid launch. Never promise100% security, legal compliance, notification sound or App Store approval.

## Payments and email — 31 October 2026

Built and tested, switched on only by configuration:

| Feature | How it works | To switch on |
| --- | --- | --- |
| Subscription checkout (Moyasar) | Owner picks a plan in «باقتي وفواتيري», pays on Moyasar's hosted page (mada, Visa, Mastercard, Apple Pay). The plan activates only after `GET /v1/invoices/:id` with the secret key confirms `paid` for the exact amount. Webhook (`/api/webhooks/moyasar`, checked against `secret_token`) and the return redirect only trigger that check; a cron re-checks pending checkouts every 5 minutes. Idempotent: replays never extend twice. Checkout is offered only when both Moyasar and Simple Fatoora are configured and the tenant has legal name/address. A verified payment creates a durable invoice job; the invoice appears only after Simple Fatoora returns a real invoice number. | Secrets `MOYASAR_SECRET_KEY`, `MOYASAR_WEBHOOK_SECRET`, `SIMPLE_FATOORA_API_KEY`; var `PUBLIC_BASE_URL`; configure `SIMPLE_FATOORA_ENABLED=true`, `SIMPLE_FATOORA_SELLER_PROFILE_APPROVED=true`, `SIMPLE_FATOORA_ENV=sandbox` after confirming the Simple Fatoora seller identity/tax profile. Live issuance also requires `SIMPLE_FATOORA_ENV=live` and `SIMPLE_FATOORA_LIVE_ISSUING_ENABLED=true`. Use `VAT_RATE_BPS=1500` and standard invoices only after ZIMARA is VAT registered. |
| Email verification and password reset (Resend) | Hashed single-use tokens (verify 48h, reset 30 min). Reset revokes all sessions. Forgot-password never reveals whether an email exists. | Secret `RESEND_API_KEY`; var `MAIL_FROM` on a verified sender domain. |

Still not verified: Simple Fatoora sandbox/live document issuance and email delivery. Not built: direct Foodics/Rewaa adapters, Wallet passes, SMS/WhatsApp.

### Simple Fatoora subscription invoices

The Worker calls the official Simple Fatoora SDK API from the server with `X-API-Key`; it never exposes the key to a browser. The owner billing profile is required before checkout. An outbox runs after Moyasar confirms payment. If a create response is ambiguous, the worker searches by a stable invoice reference and does not blindly issue a duplicate. Sandbox is the default; no live invoice is used for testing. Invoices are shown in the subscription dashboard. Configure email delivery separately in Simple Fatoora if desired.

Provision `SIMPLE_FATOORA_API_KEY` as a Worker secret. Keep the environment flags in the Worker settings (or `.dev.vars` locally); never put keys in Git. See [integration status and recovery](docs/INTEGRATIONS.md).

## Rewaa, legal details and billing emails

- **Rewaa** (`src/providers/rewaa.js`): owners link a branch to a Rewaa stock location from Integrations. The Worker polls sale invoices every minute and opens one pager ticket per invoice (`rewaa_invoices` guarantees once). Credentials and tokens are AES-GCM encrypted with `POS_ENCRYPTION_KEY`. Enable with `REWAA_ENABLED=true`. Rewaa does not publicly document a sale-invoice list endpoint; the default is `/pos/invoices`, overridable with `REWAA_SALES_PATH`. Readiness stays `configured_unverified` until a real sale is tested.
- **Legal details**: admins edit ZIMARA's legal name, CR, VAT number, address and support contacts (`PUT /api/admin/legal`); `/legal` shows only filled fields. Owners keep their own billing details (`/api/owner/billing-profile`).
- **Billing emails** (`src/notices.js`): payment receipt after a verified Moyasar payment, trial-ending (3 days), and renewal reminders (7 days and 1 day), each sent once per period.

## Automatic deploys (review)

The review Worker `zimara-menu-review-20261031` is connected to Cloudflare Workers Builds on `main`.
Build: `npm ci && npm test`. Deploy: `npx wrangler d1 migrations apply zimara-menu-review-20261031 --remote -c wrangler.review.jsonc && npx wrangler deploy -c wrangler.review.jsonc`.
Every merge to `main` runs the tests, applies new D1 migrations to the review database only, and deploys the review Worker. Production (`wrangler.jsonc`) is not deployed by this pipeline.
