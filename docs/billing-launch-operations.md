# Billing and receipt delivery

Subscription checkout remains unavailable until both the Moyasar gateway and Simple Fatoora invoicing configuration pass their server checks. A Resend key alone does not activate billing. No automatic card renewal or recurring payment mandate is implemented: customers manually pay for a new monthly or annual period. Cancellation takes effect at the recorded paid period end. VAT defaults to zero; only an actually registered seller should configure a VAT rate.

Payment status, subscription activation, the invoice job and per-owner receipt jobs commit in one D1 transaction. Provider-confirmed amounts and currency must match the checkout. Concurrent webhook, browser sync and reconciliation calls do not extend the period twice. A failed outbox insert rolls back activation so the next reconciliation can recover safely.

Apply migration `0024_subscription_receipt_jobs.sql` before deploying the billing code. The scheduled handler must call `processReceiptOutbox(env)` from `src/receipt-outbox.js`. Delivery waits until all Resend settings exist. Receipt email is payment confirmation, not a tax invoice; the separate invoice job must receive a valid provider document with the matching amount and explicit sandbox/live environment before it becomes issued.

Receipt recipients, names, paid period and dashboard URL are captured at settlement; the sender is captured at the first attempt. The outbox retries every five minutes with the same Resend idempotency key. A worker interrupted after provider acceptance can retry safely within Resend's 24-hour idempotency guarantee. The implementation stops retries after 23 hours from the first attempt, leaving `state = 'unknown'` and `last_error = 'idempotency_window_elapsed'`. Review those rows against Resend delivery records before any manual resend. Do not reset unknown rows blindly: the earlier email may already have been accepted. `sent` means Resend returned a message ID; it does not prove inbox delivery.

Useful read-only diagnostics (run against the intended database):

```sql
SELECT state, COUNT(*) AS count FROM subscription_receipt_jobs GROUP BY state;
SELECT checkout_id, user_id, attempts, first_attempt_at, last_error
FROM subscription_receipt_jobs WHERE state = 'unknown';
SELECT state, COUNT(*) AS count FROM subscription_invoice_jobs GROUP BY state;
```

Password reset keeps the same public response for existing and unknown accounts even during a provider outage. Failed reset email acceptance records `password.reset_delivery_failed` for operations. Verification/reset emails remain interactive requests; they are not replayed automatically from this payment receipt queue.

Tests use mocked providers only. Neither successful local tests nor configuration presence proves live payment, invoice or email delivery.
