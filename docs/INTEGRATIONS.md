# Integration status and runtime contracts

Verified scope: local application, synthetic data only. No payment was charged, no
invoice was issued, no vendor POS order was created, and no message was sent.
A configured secret is not a successful integration test.

## Current status

| Capability | Implemented here | Ready for a customer today |
| --- | --- | --- |
| Tenant invoice list/detail | Tenant-filtered, paginated records; empty by default | Only after authoritative provider records exist |
| Subscription checkout | Explicit provider interface; endpoint fails closed with 503 | No: gateway implementation and merchant setup required |
| Payment webhook | Fails closed; never activates subscriptions | No: verified provider contract and tests required |
| Simple Fatoora | Invoice provider interface and record model | No runtime API implementation; the chat connector is separate |
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

- Payment authority comes from a verified provider server result, checked against an
  immutable local payment intent: expected tenant, plan, period, amount, SAR currency,
  merchant account and payment ID. A success URL is never payment proof.
- A real implementation must verify the provider's actual webhook authentication
  contract. Do not label the generic POS HMAC below as a Moyasar signature.
- The official Moyasar payment-reference URL requested during implementation returned
  HTTP 403. No signature scheme or checkout request was guessed from that failure.
- `POST /api/owner/billing/checkout` returns `503 billing_not_configured`.
  `POST /api/billing/webhook/:provider` returns `503 billing_webhook_not_implemented`.
  Neither endpoint alters a subscription, even with `status=paid` supplied by a client.
- `PaymentProvider` and `InvoiceProvider` in `src/providers/contracts.js` are extension
  contracts, not working payment/invoice adapters. Implement and test them before
  enabling money movement or invoice issuance.
- Only trusted provider processes may insert `subscription_invoices`. There is no
  public invoice insertion endpoint. No invoice or PDF is fabricated or seeded.
- `GET /api/owner/invoices` returns only the current organization, with bounded
  pagination. Detail reads require the same organization; another tenant gets 404.
- Invoice amounts use integer halalas and enforce `total = subtotal + vat`. Tax status,
  invoice type and ZATCA integration stage must come from approved business/provider
  configuration, not an unconditional assumption that every subscriber owes VAT.
- Future issuance must use an outbox/retry process with a stable payment reference and
  provider idempotency. Network acceptance is not proof of document issuance, ZATCA
  acceptance, PDF readiness or email delivery; store these states independently.

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
