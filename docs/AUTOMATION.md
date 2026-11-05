# Signed operations automation

Ticket transitions to ready, collected and cancelled can emit `ticket.status_changed`
to a single operator-controlled HTTPS receiver, including an n8n ingress.
The ticket update and outbox insert share one D1 transaction. Stale versions,
cross-branch attempts and realert actions do not create events. Events contain
organization, branch and ticket identifiers, status, version and timestamp; no
customer names, contact details, collection tokens or payment data.

This integration is **disabled by default**. No external workflow has been
created, activated or verified by this implementation. Local tests use injected
fetch functions and make no outbound requests.

## Operator configuration

1. Apply `0025_automation_deliveries.sql` with the existing D1 migration process.
2. Deploy a receiver with raw-body signature verification and durable event-ID
   deduplication. Keep the same deduplication store through retries/restarts.
3. Set `AUTOMATION_WEBHOOK_URL` to its public HTTPS URL. The URL is deployment
   configuration; administrators and tenants cannot supply it through the API.
   Only standard-port HTTPS DNS names are accepted. IP literals, credentials,
   fragments and common private/local suffixes are rejected. Configure network
   egress/DNS to prevent this operator-managed hostname resolving to private
   services. Redirects are forbidden, including to another public hostname.
4. Provision `AUTOMATION_SIGNING_SECRET` as a runtime secret (at least 32 characters;
   use a cryptographically random independent value), shared only with ingress.
5. Set `AUTOMATION_ENABLED=true` only after the receiver is ready. Configuration
   reports `configured_unverified`; it never implies a verified live workflow.

Use a controlled non-production ticket to verify one receipt and one duplicate
before enabling any downstream action. No configuration values or secrets are
committed by this feature. Turning the flag off stops dispatch and event capture;
it does not backfill transitions made while disabled. Existing pending events
remain queued until re-enabled. When changing receivers, drain or review pending
events before enabling the replacement.

## Receiver verification contract

Requests are JSON POSTs with these headers:

| Header | Meaning |
| --- | --- |
| `x-zimara-event-id` | Stable UUID across all delivery attempts |
| `x-zimara-timestamp` | Current attempt's Unix time in whole seconds |
| `x-zimara-signature` | Unpadded base64url HMAC-SHA256 signature |

Compute HMAC over the exact bytes of `timestamp + '.' + raw_request_body`.
Verify the timestamp is an integer and within five minutes of receiver time,
compare signatures using constant-time byte comparison, and require the event
ID header to equal the JSON body's ID. Reject bad signatures before parsing or
running workflow actions. Do not reserialize the parsed JSON to verify it.

Example body (illustrative IDs):

```json
{
  "id": "event-uuid",
  "type": "ticket.status_changed",
  "version": 1,
  "occurred_at": 1793875200000,
  "org_id": "organization-uuid",
  "data": {
    "branch_id": "branch-uuid",
    "ticket_id": "ticket-uuid",
    "status": "collected",
    "version": 3
  }
}
```

After verification, atomically persist the event ID before acknowledging durable
acceptance with a 2xx response. Return 2xx for previously accepted event IDs too.
If acceptance cannot be persisted, return a failure so the sender retries.
Delivery is at least once: a receiver can accept an event and the sender can
crash before recording its success. Downstream actions need their own durable
idempotency keyed by event ID. For status-sensitive actions, compare per-ticket
versions: retries can arrive after newer transitions.

For n8n, put this verification/deduplication at trusted ingress or an equivalent
first step that preserves raw bytes. A standard unauthenticated Webhook node
alone is insufficient. Importing a workflow or setting its URL does not complete
these requirements. Keep messaging, purchase and provider action nodes disabled
until separately configured and authorized. No n8n execution is part of tests.

## Retry and inspection

The scheduled handler claims at most 10 due events per invocation with a 60-second
lease and a five-second request timeout. Non-2xx responses and network errors
retry up to five attempts with exponential delays starting at one minute and
capped at one hour. The existing schedule cadence determines when due attempts
actually run. Expired leases recover; an expired final attempt becomes failed.
Suspended organizations do not dispatch. Terminal records expire after 30 days
when the configured scheduler runs; pending records remain until resolved.

The administrator's Automation screen shows configuration state, delivery status,
attempt count and last HTTP status. `GET /api/admin/automation` omits payloads,
callback URLs, secrets and receiver response bodies. Administrators can queue
failed events again with `POST /api/admin/automation/:id/retry` and an empty JSON
object. This resets the attempt budget and records an audit entry; it does not
send immediately. Owners, cashiers and anonymous visitors cannot access it.

The outbox is intentionally separate from the existing Telegram and loyalty
win-back features. It does not activate them or claim they are externally verified.

## Local validation

```sh
source /workspace/toolkit/env.sh
node --test --no-warnings test/automation.test.js
```

Tests cover disabled configuration, endpoint restrictions, atomic rollback and
version conflicts, exact HMAC bytes, concurrent claims, stable retry IDs, bounded
failures, lease recovery, suspension and administrator authorization/redaction.
