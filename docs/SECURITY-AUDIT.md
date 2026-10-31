# Targeted security and lifecycle review

Date: 2026-10-31 UTC. Target: the working branch of `zimara-hq/zimara-menu`, built on PR #1 (`e6dafae853f6ee7f04d5ae2d7a07190702c9a85e`).

This is a source review and local automated regression exercise, not a completed penetration test, production assessment, legal certification, or assurance of 100% security. Strix was not run, as requested. No competing service was attacked. No production database, account, MFA setting, secret, billing transaction, or DNS record was changed by these tests.

The Codex Security skill was inspected, but its mandatory `core-scan.md` and `scan-prologue.md` resources were unavailable through the configured skill reader and no security-scan host tools were exposed. Accordingly, this document does not claim that the Codex Security scan workflow completed.

## Boundaries reviewed

- Anonymous public menu/profile, customer-order, pager-token and loyalty-card routes.
- Owner and branch sessions, branch/tenant scope and disabled-account checks.
- Platform administrative operations, password handling, TOTP enrollment/login/recovery.
- Trial/subscription write permissions, item/branch quotas, request-size and CSRF boundaries.
- Cashier creation and optimistic lifecycle transitions, retry receipts, invoice references.
- Push endpoint validation and outgoing requests.
- Tenant upload/import and generic signed POS-bridge boundaries through their implementation and regression tests. Provider-specific POS, billing, Wallet and physical-device behavior remain outside verified operation.

## Changes and evidence

| Area | Defect or boundary | Implemented control | Evidence |
| --- | --- | --- | --- |
| CSRF | JSON-only requests previously lacked explicit Origin/Fetch Metadata rejection | Mutations reject foreign Origin and cross-site metadata; media type is checked; API payloads are bounded to 4 MiB | `test/onboarding-security.test.js` |
| Administrative access | Production could rely on a single password if a deployment forgot the opt-in flag | Production always requires MFA enrollment/verified administrative session; other environments can opt in with `REQUIRE_ADMIN_MFA=true` | `test/ticket-lifecycle-security.test.js`, `test/onboarding-security.test.js` |
| MFA secrets/replay | TOTP seed and replay state need protection independent of UI | AES-GCM encrypted seeds, bounded login failures, monotonic TOTP counter, single-use HMAC-hashed recovery codes, old-session invalidation on enrollment | `src/mfa.js`, `test/onboarding-security.test.js` |
| Tenant lifecycle | Existing sessions could retain access after a tenant or branch was suspended | Shared authorization checks organization and branch activity on every request; public pager reads also require active organization/branch | `test/ticket-lifecycle-security.test.js` |
| Subscription lifecycle | Trial expiration must not depend solely on an eventually executed Cron | Write guard computes expiry on each mutation; cancellation and account-security maintenance remain accessible | `test/onboarding-security.test.js`, `test/ticket-lifecycle-security.test.js` |
| Quotas | A request-level COUNT check alone races under parallel imports/creation | SQLite insert triggers enforce item and branch limits for subscribed tenants, alongside readable API checks | `migrations/0002_accounts.sql`, `test/features.test.js` |
| Cashier integrity | An invoice reference was conflated with a pager number and network retries could create multiple tickets | Separate validated invoice field, independent automatic sequence, backwards-compatible explicit `number`, scoped idempotency fingerprint and transactional ticket/receipt creation | `migrations/0007_ticket_requests.sql`, `test/ticket-lifecycle-security.test.js` |
| Concurrency | Two distinct cashiers could select the same automatic number | Existing unique open-number index is retained; allocation retries conflict rather than duplicating the number | `test/ticket-lifecycle-security.test.js`, `test/pager.test.js` |
| Push egress | Host allowlisting alone allowed unusual URL credentials/ports and did not bound redirects or duration | HTTPS allowlist, no URL credentials/fragments/nonstandard ports, validation at send boundary, redirect rejection and 10-second timeout | `src/push.js`, `test/ticket-lifecycle-security.test.js` |
| Public write amplification | A bearer ticket could register unbounded push destinations; card issuance was unbounded per IP | Atomic five-device subscription cap with a truthful 429 response; public card creation limited to 20/IP/hour | `test/ticket-lifecycle-security.test.js` |
| Payment authority | A checkout callback must not activate subscriptions or fabricate invoices | Unimplemented billing/webhook paths fail closed; invoice retrieval is tenant-scoped; no fake invoices are seeded | `test/integrations.test.js` |
| POS authority | Generic bridge events must not acquire tenant identity from attacker-supplied JSON | Connection-bound scope, encrypted per-connection secrets, timestamped HMAC verification, payload-bound event idempotency | `test/integrations.test.js` |
| Demo lifetime | Derived branch accounts could otherwise acquire ordinary long-lived sessions and reserve real email addresses | Session issuance is centrally clamped to room expiry, every session read checks expiry without waiting for Cron, and accounts created from demo roles require `@demo.invalid` | `test/ticket-lifecycle-security.test.js` |
| Hidden menu content | The legacy public menu API could return active items from an inactive category even though the view hid the category | Public menu query now joins same-tenant categories and requires active categories; owner previews retain hidden entries | `test/ticket-lifecycle-security.test.js` |
| Rendering | Tenant text, URL and image data reach HTML views | Server-side field/type/URL limits; existing shared HTML escaping; JSON responses with nosniff; script CSP restricted to self | Source spot checks of shared rendering helpers and changed views. No claim of exhaustive browser XSS testing. |

## Local verification

`npm test` uses isolated in-memory SQLite databases through the repository D1 test adapter. The latest completed full-suite result is recorded by the implementation handoff; this review added nine ticket/lifecycle/security tests plus the five onboarding/security tests. The nine focused tests pass, covering invoice/number separation, transactional retry, two concurrent allocations, expired branch sessions, inactive bearer access, push egress constraints/fanout limits, mandatory production MFA, derived demo-account isolation, and hidden-category confidentiality. The completed full-suite result after these changes was **50 passed / 0 failed**, recorded in `output/security-api-tests.txt`; later demo and browser evidence is maintained by the main implementation workflow.

A local D1 adapter is not evidence of geographically distributed D1 behavior, provider delivery, actual Safari/Android notification receipt, or production WAF/backup readiness.

## Residual limits and deployment conditions

1. **Bearer links are capabilities.** Anyone given a customer ticket link can view and acknowledge that ticket. Share them only with the customer; do not publish them on the public profile/menu. Display-device credentials are separate, revocable and read-only.
2. **Implicit linking is retained deliberately.** `GET /api/t/:token` records the first customer API read and hides the displayed QR, preserving the existing scan-to-link journey. A party that already knows the bearer token can make that read; aggressive prefetching of the API URL can consume the displayed link. An explicit authenticated device-claim protocol is a separate product/security change, not implemented here.
3. **Retry callers must send a stable `idem_key`.** The new cashier UI can do so; the legacy endpoint still accepts callers without it for compatibility. Omitting the key intentionally forfeits retry deduplication.
4. **Demo account addresses are intentionally synthetic.** Staff created inside a demonstration must use `@demo.invalid`; these credentials cannot acquire an independent account lifetime beyond the room. The browser may retain an expired cookie, but the server denies it.
5. **Real account verification remains unavailable.** New owners are explicitly unverified until a delivery/verification provider is implemented. Password recovery and verified-email ownership are commercial-release requirements, not simulated successes.
6. **Existing organizations without subscription rows are grandfathered.** Applying plan enforcement to them requires an explicit, reviewed billing migration. No paid plan can be claimed operational until its provider is integrated and verified.
7. **Secrets and infrastructure remain operational responsibilities.** Preserve `AUTH_SECRET`; changing it invalidates session HMACs and the ability to decrypt current MFA seeds. Use reviewed secret rotation/migration and backups. This exercise did not verify retention, restoration, alerting, customer deletion/export, or incident response end to end.
8. **External integrations are not assumed active.** Payment, tax invoicing, direct Rewaa/Foodics adapters and Apple/Google Wallet require their documented contracts, credentials, approvals and actual acceptance tests. Web Push configuration alone does not prove lock-screen sound; device settings and OS restrictions apply.
9. **No separate immutable super-owner role was added.** The existing platform `admin` model and four-account cap are preserved. A distinct Az-only super role and impersonation workflow need a separate reviewed authorization migration.
10. **Not exhaustive.** Distributed rate-limit behavior, dependency supply-chain audit, load testing, origin infrastructure, real physical devices, mobile-app store compliance and malicious font/rendering fuzzing were not established by this bounded review. Style CSP retains `unsafe-inline` for the inherited view system; script CSP does not allow inline scripts.
