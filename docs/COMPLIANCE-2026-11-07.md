# Compliance: Saudi law and App Store readiness

Last reviewed 2026-11-07. This is engineering guidance, not legal advice. Items marked
**(lawyer)** need confirmation by a licensed Saudi lawyer before commercial launch.

## What the code now guarantees

| Area | Rule | Where |
|---|---|---|
| PDPL right to destruction, App Store 5.1.1(v) | An owner's deletion request (dashboard or `/api/v1/owner/data/deletion-request`) is cancellable for 14 days, then the cron erases menus, branches, guests, cards, orders, waitlist, assets, domains and credentials. Owners are anonymised, branch accounts deleted. Invoices, payments, billing notices and the audit log stay (commercial books and tax records). Admins can complete early: `POST /api/admin/deletion-requests/:id/complete`. | `src/privacy.js` |
| PDPL data minimisation and retention | Names, phones, addresses, car details and notes in orders and the waitlist, and rating comments, are stripped after `PII_RETENTION_DAYS` (default 90). Expired email tokens and rate-limit rows are purged. | `privacyCron` |
| Schema coverage | A test fails if a new table is not classified as erased, retained or platform-only. | `test/compliance.test.js` |
| Marketing consent | Loyalty offer pushes are opt-in ("Send offers to my phone") and now have a one-tap opt-out (`POST /api/cards/:token/unsubscribe`). Ad pixels run only after consent; the banner links to the privacy notice. | `src/loyalty.js`, `public/card.js`, `public/addons-public.js` |
| E-Commerce Law: consent to terms | Sign-up is refused unless `accept_terms === true`; the accepted version and time are stored on the owner. Bump `TERMS_VERSION` in `src/accounts.js` when the terms change. | `src/accounts.js`, migration 0027 |
| E-Commerce Law: seller identity and policies | `/legal`, `/privacy`, `/terms` publish the privacy notice, terms, cancellation and refunds, account deletion and subscriber data-processing terms in Arabic (governing) and English. Legal name, CR and address come from admin settings and show "being issued" until set. The landing footer prints them. | `public/legal.js`, `public/landing.js` |
| ZATCA / VAT | ZIMARA is not VAT-registered: the pricing note says the listed price is final and no VAT is added. Checkout refuses to charge VAT (`VAT_RATE_BPS>0`) unless ZIMARA's VAT number is saved in legal settings. Unregistered subscribers can now subscribe (their VAT number was wrongly mandatory when VAT applied). | `src/billing.js`, `src/providers/simple-fatoora.js` |
| SFDA menu labelling | Calories and allergens can no longer be hidden by a theme or design. The setup checklist counts items without calories. | `src/identity.js`, `src/design.js`, `src/setup.js`, `public/workspace.js` |
| App Store 3.1.1 / 3.1.3(c), Google Play payments | A purchase cannot be started with an app (Bearer) session: `403 billing_web_only`. Apps must not show prices with a buy button or link to the web checkout. | `src/billing.js` |
| Universal links, App Clip, passkeys | `/.well-known/apple-app-site-association` is served only when `APPLE_TEAM_ID`, `APPLE_BUNDLE_ID` (and optionally `APPLE_APP_CLIP_BUNDLE_ID`) are set. | `src/app.js` |
| Google reviews | The review link is shown to every guest; no reward is attached (already in place). | `public/ticket.js` |
| Waiting games | For fun only, no prizes (already in place). | `public/ticket.js` |

## App Store submission checklist (for the native app, not built yet)

- **4.2 minimum functionality:** ship native value (camera QR, push, Live Activity for the pager), not a wrapped website.
- **5.1.1(v) account deletion:** in-app button calling the deletion-request endpoint; explain the 14-day window in the UI.
- **5.1.1 privacy:** privacy policy URL `https://<domain>/privacy`, support URL, accurate App Privacy label (no tracking; contact info, name, email, device ID for app functionality). Template manifest: `docs/app-store/PrivacyInfo.xcprivacy`. Add one per target and verify every SDK's own manifest.
- **3.1.1 / 3.1.3(c):** no in-app purchase of subscriptions and no links or wording that steer to web purchase. The server already blocks app-session checkout.
- **3.1.3(e):** food orders are physical goods: pay with the regular gateway, never IAP.
- **App Clip:** under the App Clip size limit, no account required for the pager, App Clip experience URL on `/t/*`, and Live Activities started only for a ticket the guest scanned.
- **2.1 review notes:** provide a demo owner and cashier account (synthetic data) and steps to trigger a pager call.
- **Push:** ask permission in context, not at launch; never use pager pushes for marketing.
- **Sign in with Apple:** not required while sign-in is email/password and passkeys only. If Google or other social login is added, offer Sign in with Apple too (4.8).

## Needs a decision or details from the owner

- Legal name, CR number and national address (admin legal settings).
- E-commerce authentication (Saudi Business Center) number, once issued.
- Refund window beyond the service-failure rule in the terms.
- Whether ZIMARA must register with SDAIA's national data governance platform **(lawyer)**.
- Cross-border transfer assessment for Cloudflare, Resend (Tokyo region) and Anthropic **(lawyer)**.
- Simple Fatoora while not VAT-registered: checkout currently requires e-invoicing to be configured; confirm the provider can issue non-VAT invoices, or decide to issue plain invoices until registration.
- When VAT registration happens: set the VAT number, `VAT_RATE_BPS=1500`, and change the pricing note to "prices include VAT" with VAT-inclusive amounts.
- Apple Developer account, Team ID and bundle IDs; Google Wallet issuer account.

## Merge verification safeguards — 2026-11-14

Destructive privacy processing is opt-in via `PRIVACY_ERASURE_ENABLED=true`, disabled by default. No existing deletion request is backfilled with a schedule. Admin completion cannot bypass the 14-day grace period. Request claiming and data changes share one database transaction; a cancellation winning first prevents deletion. Seasonal organisation data is included. The UI distinguishes review-only requests, scheduled requests and paused processing. External storage/domain cleanup failures retain audit references for manual remediation; automatic retries are not implemented. See `AZ-ACTIONS.md` before activation. No production erasure, live messaging or payment was used for verification.

Card offer opt-out removes that card from service-worker tracking and database subscriptions while preserving other cards and pager subscriptions. Local regression tests exercise the actual scripts, including timeout/retry behavior. Readiness checks do not certify Saudi or app-store compliance.
