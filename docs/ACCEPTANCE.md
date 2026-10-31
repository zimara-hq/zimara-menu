# Standalone ZIMARA Menu review acceptance

Verified 31 October 2026 UTC. This is a working synthetic-data review version, not a commercial-launch certificate.

- Product: https://zimara-menu-review-20261031.zimara-hq.workers.dev/
- Connected demo: https://zimara-menu-review-20261031.zimara-hq.workers.dev/demo
- Signup/login: `/register`, `/login`.
- Implementation source: `efbfe3bf3f4ee272ce5a72bfbf5c11f22cb9961d`; subsequent acceptance-only documentation does not change bundled application code.
- Bundle SHA256: `428760a77a9b0808c9263f5919f3a84e9c20afe1a2efac498147435b41200f34`.
- Worker version: `2e053893-7c57-4c59-b24e-8c82e18619af`; deployment `c805f9ea-89cc-4edc-a69b-8641eaac3bb2`.
- Review D1: `zimara-menu-review-20261031`, UUID `60a47a0e-e8e7-40d7-92ee-90889e685318`. Migrations0001–0008 applied and registered in standard `d1_migrations`. Cron scheduled every minute. No institutional resources or DNS changed.

## Actual validation

| Check | Environment and result | Evidence |
|---|---|---|
| API/security/business rules |55 passed,0 failed; separate in-memory SQLite D1 adapters | `npm test`, `test/*.test.js` |
| Deployable build | Worker dry-run passed; embedded-asset package passed SHA check on Cloudflare upload | `npm run build`, `npm run build:preview`, `qa/evidence.json` |
| Connected three-device workflow |14 checks passed on local Workers and again on the final HTTPS version; zero page errors | `test/e2e/connected.mjs`, `qa/evidence.json` |
| Signup/import/orders UI | Actual HTTPS signup → CSV preview/apply → profile/settings → mobile cart → cashier acceptance → pager/game passed; zero page errors | `test/e2e/onboarding.mjs` |
| Durable QR behavior | Private display code disappears after separate customer links; public menu contains no ticket token | connected E2E + API tests |
| State/conflict/recovery | Invoice separate from auto number; second cashier stale command409; seen ≠ collected; offline/reload preserves state; actual pickup/rating completes | connected E2E + ticket tests |
| Loyalty |3 stamps and atomic redeem; customer balance remains0 after reload; duplicate/concurrent actions covered by API suite | connected E2E + ledger tests |
| Privacy controls | Tenant-safe paginated export; password-confirmed pending deletion request; immediate guest-card token/code revocation; retained anonymous ledger; suspended-owner exceptions narrowly tested | `test/features-data.test.js` |
| Responsive/accessibility basics |360/390/1440 browser checks; one confirm batch of8 viewport×locale×theme variants, keyboard tabs, reduced motion, no page overflow; CTA contrast5.14:1 default/6.73:1 hover | `UX-REVIEW.md` |
| Performance | One cold-cache Chromium lab run, mobile390,1.6Mbps/150ms RTT/4×CPU: LCP1,124ms, CLS0.00611. This is not field Core Web Vitals certification | `qa/performance.json` |
| CI | All three stacked implementation PR commit workflows succeeded; final implementation run includes API/build/browser jobs | https://github.com/zimara-hq/zimara-menu/actions/runs/41175502983 |

`acceptance.csv` contains the explicit pass/blocked/not-built matrix. `qa/evidence.json` binds source, environment, bundle and deployment. Screenshots are synthetic: `qa/landing-desktop.png`, `qa/landing-mobile.png`, `qa/customer.png`. They are not device notification-delivery proof.

## Merge/review stack

Preserve #1; the dependent stack is **#1 → #2 → #3 → #4**. The base branches intentionally point at the preceding implementation stage; do not squash away or force-reset another contributor's source. These PRs remain open for review. Nothing has been merged into main or routed to the institutional domain.

## Operational limits

- No paid checkout, recurring charge or live tax invoice was created. Payment and invoicing runtime adapters still need implementation/verified contracts and merchant setup, not merely a key.
- Simple Fatoora's chat connector was checked read-only and is connected to Live. That does not authorize or configure the Worker's runtime API. No Live test document was issued.
- Direct Rewaa/Foodics/Odoo/Deliverect adapters are not built. The internal signed POS bridge is implemented and tested, not represented as an approved vendor connection.
- Apple/Google Wallet signing, issuance and update services are not built. Certificates, issuer approval and physical iPhone/Android/Watch tests are required. Web Push sender remains available but unconfigured/unverified on this preview; in-page status/audio activation is the demonstrated web path. A powered-off phone cannot receive alerts; locked-device sound depends on OS/network/permissions/settings.
- R2-backed image/font handlers are implemented and size/magic validated. Cloudflare refused bucket creation with403/10042 because R2 must first be enabled in the account dashboard. No billing enablement was attempted.
- CSV import supports Excel exports. Native XLSX, broad design-canvas editing, separate super role/impersonation, fully automated erasure/retention and production verified-email/password recovery are not implemented.
- Commercial legal identity, DPA, final prices/policies, jurisdiction/transfer review, domain, backup/monitoring and owner acceptance remain prerequisites. Research is not legal advice or100%compliance/security assurance. Strix was deliberately deferred.

The existing main-site product/demo routes were inspected read-only and left intact; see `SOURCE-CONTINUITY.md`. This standalone build is not an iframe copy or a deployment over zimara.co.
