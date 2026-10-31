# Integration status and runtime contracts

Verified scope: local application, synthetic data only. No payment was charged, no
invoice was issued, no vendor POS order was created, and no message was sent.
A configured secret is not a successful integration test.

## Current status

| Capability | Implemented here | Ready for a customer today |
| --- | --- | --- |
| Tenant invoice list/detail | Tenant-filtered, paginated records; real provider document and PDF URL only | Needs provider credentials, complete billing profile and sandbox verification |
| Subscription checkout | Moyasar hosted checkout; server verifies payment before activating plan | Needs Moyasar credentials and Simple Fatoora issuing configuration |
| Payment webhook | Authenticated signal triggers server-side Moyasar invoice verification; never trusts a browser success URL | Needs merchant configuration and a real sandbox payment |
| Simple Fatoora | Server-side SDK adapter, durable post-payment outbox and ambiguous-result reconciliation | Needs a runtime API key, explicit environment flags, complete billing profile and sandbox verification |
| Generic POS bridge | Encrypted connection keys, HMAC-authenticated create/ready events, replay/idempotency checks, tenant-bound mapping, revocation | Locally tested; external vendor deployment not verified |
| Rewaa | Referenced official docs | Direct adapter is not built |
| Foodics | Status and provider boundary | OAuth adapter, partner approval and tests are not built |
| Apple / Google Wallet | Capability readiness and existing planning document | Signing, issuance, updates and real-device tests not built |
| Web Push | Existing VAPID sender retained | Needs configured keys and real-device delivery tests |
| SMS / WhatsApp | Honest disabled status | No runtime implementation |

`GET /api/owner/integrations` and the platform-admin equivalent expose `implemented`,
`configured`, `verified`, state, and bilingual reason fields. `verified` is deliberately
false: the application does not invent a successful remote check. Even when the POS
bridge or VAPID keys are configured, state remains `configured_unverified`.

A read-only Simple Fatoora connector status check on 2026-10-31 reported the account
connected in **Live** for ZIMARA. The application runtime has not inherited any API
credential or authorization from that chat connector. No environment was changed and
no document was created. Do not treat the connected chat account as an active Worker
integration or use live invoice creation as a smoke test.

## Payment and invoice rules

- The connected Simple Fatoora chat account is not a Worker credential. The Worker uses a separate server secret, `SIMPLE_FATOORA_API_KEY`, with the [official Simple Fatoora SDK API](https://simplefatoora.com/en/apiintigration/). The API key is never sent to the browser or written to logs.
- Use a sandbox API key with `SIMPLE_FATOORA_ENV=sandbox` and `SIMPLE_FATOORA_ENABLED=true` first. Live issuance is separately guarded by `SIMPLE_FATOORA_ENV=live` and `SIMPLE_FATOORA_LIVE_ISSUING_ENABLED=true`. The integration remains `configured_unverified` until a sandbox document and returned record are checked.
- Paid checkout is offered only when Moyasar and Simple Fatoora are both configured and the subscriber has a legal name and address. A buyer VAT number is required when a non-zero VAT amount is configured.
- Payment authority comes from a server-to-server Moyasar invoice read, checked against the stored checkout, expected amount and SAR currency. The success redirect and webhook payload only trigger that read; neither alone proves payment.
- The paid checkout transaction creates one local invoice record and one outbox job. The cron calls `POST /sdk/invoice/create` only after Moyasar confirms payment. The job uses the buyer details from the private owner billing profile and uses one stable reference for the Simple Fatoora document.
- A completed create is recorded only after Simple Fatoora returns its document ID and invoice number. A timeout or server error is ambiguous: the job moves to `unknown`, and the worker performs read-only searches using the stable reference. It never blindly repeats an uncertain create. Multiple/no matches remain unresolved and require provider reconciliation before any manual reissue.
- Definite provider rejections are recorded as rejected, not shown as issued. Saving corrected billing-profile details requeues those rejected jobs. A legal name/address is required; VAT is taken from the verified billing settings and configured checkout amount, not inferred from the company name.
- Invoice records remain tenant-scoped. `GET /api/owner/invoices` is paginated and never creates documents. PDF links appear only when Simple Fatoora returned them. The current Simple Fatoora account preference does not send customer invoice emails, so the dashboard is the delivery path unless email sending is separately enabled with the provider.
- No credential or environment is inherited from the chat connector. No live document or payment was created during this implementation. Do not use a Live invoice as a smoke test.
- Checkout currently fails closed unless both integrations and billing details are ready. Never activate a plan from a client-supplied `status=paid`; verify the exact stored payment with Moyasar first.
- Tax status and document type must match ZIMARA's approved seller profile. The API's presence does not itself confirm that ZIMARA has completed its tax/legal setup or ZATCA onboarding.

## Generic POS bridge v1

This is ZIMARA's own protocol. It is **not** native Rewaa or Foodics webhook support.
A merchant-controlled backend/automation can translate an approved vendor event to
this protocol only after vendor API rights and mapping are verified.

### Enable explicitly

Provision secrets privately with Wrangler, never in chat or committed files:

- `POS_ENCRYPTION_KEY`: 32 random bytes encoded as base64url. Used by WebCrypto AES-GCM
  to encrypt connection signing secrets at rest; connection ID is authenticated data.
- `POS_BRIDGE_ENABLED=true`: Worker configuration feature flag. Off by default.

Key rotation needs an explicit re-encryption/connection replacement migration. Changing
this key alone makes existing connections unreadable; it must not be done silently.
An active Pro/Chains entitlement is required when a subscription exists. Revoked,
suspended, cancelled or inactive organizations/branches cannot ingest new events.

Owner creates a connection using:

```http
POST /api/owner/pos-connections
Content-Type: application/json

{"provider":"generic_bridge","branch_id":"owned-branch-id","label":"My backend"}
```

The response includes the opaque connection ID, endpoint and a `signing_secret` **once**.
The app stores only AES-GCM ciphertext. List responses and audit logs never return
that ciphertext or signing secret. Owner revokes immediately through
`POST /api/owner/pos-connections/:id/revoke`. Connect/revoke operations are audited.
No vendor-provided credential should be put in the browser or an n8n workflow export.

### Send events

POST JSON to the returned `/api/integrations/pos/{connection}/events` endpoint.
Use the exact UTF-8 request body, without reformatting it after signing:

```json
{"id":"stable-event-id","type":"order.created","external_order_id":"vendor-order-id","invoice_number":"123"}
```

Ready event:

```json
{"id":"another-stable-event-id","type":"order.ready","external_order_id":"vendor-order-id"}
```

Headers:

- `X-Zimara-Timestamp`: 10-digit Unix seconds, within 300 seconds of server time.
- `X-Zimara-Signature`: base64url HMAC-SHA256 using the connection secret over
  `timestamp + "." + exactRequestBody`.

The signature is verified using WebCrypto verification, not a normal string comparison.
Bodies are bounded to 16 KiB. IDs are bounded. The connection fixes organization and
branch; a payload specifying `org_id`, `branch_id`, or `status` is rejected.

The `(connection_id, event_id)` key and payload hash enforce retries. Same ID and exact
payload returns `duplicate: true`; same ID and changed payload returns 409. Create-event,
ticket and external-order mapping are committed in one D1 batch transaction. Ready
transitions are versioned and never reopen collected/cancelled tickets. Duplicate ready
events do not send another initial call. Delivery uses the existing pager alert handler
when registered, followed by the existing repeat scheduler. This is best-effort push,
not guaranteed delivery to a locked device.

`invoice_number` is currently used as the visible pager number if supplied; it must be
at most 12 letters, digits or hyphens. If absent, an opaque automatic number is generated.
A duplicate open number in a branch is rejected. This bridge does not create or modify
a tax invoice in the merchant's POS.

## Before enabling a vendor integration

1. Obtain official API contract and approved merchant/partner scope.
2. Confirm OAuth grant and revocation; show scope to the owner.
3. Implement vendor-specific webhook authentication with timestamp/replay controls.
4. Map the external store to a tenant-owned branch; never accept tenant ID from payload.
5. Verify currency, invoice/order identity and status mapping in vendor sandbox.
6. Test duplicate, reordered and invalid events; retry an offline delivery safely.
7. Verify secrets stay out of logs/exports and revoke immediately.
8. Record environment, commit, provider account, actual action and evidence before
   changing any UI state to “verified”. Never use a Live charge or invoice for CI.

## Sources inspected

- Rewaa documentation landing: https://doc.api.rewaatech.com/ (HTTP 200, 2026-10-31).
  Availability of docs is not certification or verification of an account.
- Moyasar payment documentation request: https://docs.moyasar.com/api/payments/09-retrieve-payment/
  (HTTP 403 in this environment, 2026-10-31; no inferred signature implementation).
- Simple Fatoora read-only connected-account status, current environment Live.
