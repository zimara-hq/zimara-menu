# zimara-menu

نظام زيمارا للمطاعم والمقاهي: منيو إلكتروني، وبيجر ذكي يحوّل جوال العميل إلى بيجر وينبّهه بصوت، وبطاقات ولاء رقمية. لوحة تحكم بـ4 حسابات إدارية لزيمارا، وحساب مالك لكل منشأة، وحساب لكل فرع. يبدأ موقعًا، ثم تطبيقًا على Android وiOS.

**ZIMARA Menu**: e-menu, a pager on the customer's phone, and loyalty cards, for restaurants and cafés. Runs on one Cloudflare Worker, separate from the zimara-website Worker and its databases. The public trial on zimara.co (`/منيو/تجربة`) stays in zimara-website; this repo is the commercial product.

## What works now (phase 1)

| Area | Behaviour |
| --- | --- |
| Accounts | Platform admins (hard cap 4), one owner per business, one account per branch. PBKDF2 passwords, HttpOnly session cookies, login rate limit, JSON-only mutations (CSRF), audit log. Every query is scoped to the caller's business/branch. |
| Menu | Categories and items (AR/EN, price in halalas, calories, image URL). Branches mark items sold out. Public menu at `/m/<branch>` with search, plus a printable QR per branch. |
| Pager | Cashier enters the POS invoice number (or auto-numbers) and gets a per-order QR. Customer page `/t/<token>`: live status, sound + vibration, screen wake lock, Web Push. Ready → alert; repeats every 2 min up to 3 times until the customer taps "I saw it"; urgent re-alert button. "Seen" is separate from "collected". Rating, then the branch's Google review link (shown to everyone, no review gating). Front display with the latest QR and ready numbers. Open numbers are unique per branch; staff actions use optimistic versions so two screens never double-apply. |
| Loyalty | Customer gets a card at `/j/<business>` (no signup), shown at `/c/<token>` with a QR + 6-char code. Cashier scans or types the code to stamp or redeem. Append-only ledger; stamp/redeem is a single atomic SQL statement with an idempotency key, so retries never double-stamp and two redeems cannot overdraw. |
| Stats | Per branch, last 30 days: orders, collected, average/longest prep, pickup delay after the call, rating; loyalty totals. |

Not built yet, on purpose: Apple/Google Wallet passes (needs the owner's certificates, see [docs/WALLET.md](docs/WALLET.md)), payments/subscriptions, POS integrations, SMS/WhatsApp. Nothing in the UI claims them.

### Alert limits (honest version)

- Android Chrome: Web Push reaches a locked phone.
- iPhone: Web Push needs iOS 16.4+ and the page added to the Home Screen; otherwise the page must stay open (it keeps the screen awake and chimes). Wallet passes in phase 2 remove this limit.
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
