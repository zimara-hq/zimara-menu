# Review deployment and rollback

The review Worker `zimara-menu-review-20261031` uses only D1 `60a47a0e-e8e7-40d7-92ee-90889e685318` (`zimara-menu-review-20261031`). It is separate from the institutional Worker, its platform database and its existing menu trial database. It has no custom domain and creates no paid transactions or external invoices/messages. R2 was not enabled for this account: the API returned403/10042 and requested Cloudflare Dashboard enablement; no billing setting was changed.

Before updating, record the current preview Worker version/etag and the package manifest SHA. Deploy the exact tested bundle and preserve its existing `AUTH_SECRET` binding using Cloudflare `inherit` on subsequent uploads. Never generate a replacement secret for a live existing environment. The original review creation generated a separate secret only for the newly created Worker and never printed it.

For a bad preview version, restore the prior Worker version through the dashboard/version API or re-upload the recorded previous bundle with the same D1 binding and inherited secret. Do not roll back by dropping tables or resetting D1. Added migrations are additive and older application versions may not understand all new columns; verify compatibility before switching code. If no safe version exists, disable the new review Worker's workers.dev subdomain while investigating. That affects only the review build.

Cron runs every minute for trial/demo expiration and pager repeat state. Creation of new demo rooms is rate-limited and access expires after two hours; derived accounts share that expiry. Pending organization deletion is a request, not an erasure operation. Do not assume synthetic records are automatically purged: storage cleanup and commercial retention policy require a separately reviewed procedure.

Custom-domain binding, DNS changes, production database provisioning and commercial payment activation are outside this preview change. Use a protected workflow and approved configuration once the owner selects a separate domain. The existing `wrangler.jsonc` production database UUID remains a placeholder to prevent accidentally pointing at institutional storage.
