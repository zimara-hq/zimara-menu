# Launch operations and recovery

These commands are prepared and tested locally. They do not enable a scheduler,
create remote backups, establish an alert destination, or prove provider recovery.
Run from the repository root after `source /workspace/toolkit/env.sh`. No dependency
installation is needed. Node.js and Python 3 with SQLite are required.

Verified on 2026-11-05: a separate temporary local Wrangler D1 database accepted
all application migrations and a synthetic organisation, exported through the
wrapper, and restored successfully through the isolated checker (60 tables,
1 synthetic row). Temporary state was removed. Automated tests also verify full
schema restoration with a relational organisation/branch pair and reject checksum
corruption, stale backups, foreign-key violations, missing tables and attempted
SQL file attachment. Health checks reject access pages, oversized JSON, network
failures and degraded responses. These checks used no production database.

## Create and verify a backup

Always choose the actual configuration and database deliberately. The wrapper
defaults to a **local** D1 export; remote export requires `--remote`. It creates a
new private directory and refuses to overwrite an existing backup. Keep backups
outside the repository and on encrypted storage, because a SQL export includes
account information and may include encrypted provider credentials.

```sh
# Local development only; replace the output with a new directory each time.
node scripts/launch-backup.mjs --config wrangler.jsonc --database zimara-menu-db --output /secure/backups/zimara-local-YYYYMMDD
python3 scripts/launch-restore-check.py /secure/backups/zimara-local-YYYYMMDD

# Production read-only export, ONLY after replacing the production D1 placeholder,
# checking account/resource identity, access scopes and the chosen config.
node scripts/launch-backup.mjs --config wrangler.jsonc --database zimara-menu-db --remote --output /secure/backups/zimara-YYYYMMDD
python3 scripts/launch-restore-check.py /secure/backups/zimara-YYYYMMDD
```

For named Wrangler environments, include `--env NAME` in the export command.
Protect the parent storage and set a restrictive shell umask (`umask 077`). The
wrapper creates its directory with mode 0700 and SQL/manifest files with mode
0600. The manifest records source, age, bytes and SHA-256, never rows or secrets.
It does not encrypt the SQL. A checksum detects corruption; it cannot establish
authenticity if someone can replace both files. Use storage access controls and
an independently retained signed/checksummed inventory where required.

Verification creates a brand-new temporary local SQLite database, imports the
dump, checks integrity, foreign keys and core application tables, counts rows,
then removes the temporary database. No verification option targets a provider,
production database or persistent test database. It blocks SQL attachments,
extension loading, virtual tables and unsafe PRAGMAs. Treat backup files as
sensitive trusted input; run verification with a disk/resource quota for unusually
large inputs. The default freshness threshold is 48 hours. An intentional older
recovery drill can specify `--max-age-hours 720`.

The isolated import verifies that the SQL is restorable into SQLite, including
the migrated application schema. It does **not** prove a remote D1 import, Worker
compatibility, R2 asset recovery, Durable Object recovery, secret availability or
recovery time. Do not call this a completed production recovery drill.

Suggested operating targets, pending owner acceptance: daily encrypted export,
7 daily and 4 weekly retained copies, one copy in a separately controlled storage
location, 24-hour data-loss objective and a 4-hour service-restoration objective.
These are targets, not measured guarantees. Backups retain deleted information
until expiry; a recovery must reapply any deletion/revocation requests made after
the backup. Do not automatically prune the only known-good copy. Never place
customer backups or secrets in GitHub artifacts or CI logs.

## Restore rehearsal and incidents

1. Record incident start, impact, current Worker version and chosen backup timestamp.
2. Stop writes or isolate the affected environment as appropriate; preserve evidence.
3. Run the isolated verification above. Compare its expected row totals with a
   separately retained operator record; a valid empty database can pass integrity.
4. Provision a separate restricted recovery D1 database and test Worker with new
   identifiers and integrations disabled. A human must independently verify that
   none of its bindings point at production before importing. This step is not
   automated by these scripts.
5. Import into that isolated remote target using the current D1 import guidance,
   test sign-in, tenant isolation, menus, provider jobs and deletion/revocation
   replay. Preserve the matching secrets in an access-controlled vault, including
   `AUTH_SECRET` and relevant encryption keys; missing keys can make restored
   MFA/provider data unusable. Never paste secrets into tickets or this document.
6. Record measured recovery time and evidence. Switch production only after a
   reviewed cutover and rollback plan. Code rollback does not restore database
   contents; do not reset or drop production tables to undo a UI release.

Current implementation deliberately provides no remote reset or restore shortcut.
Cloudflare D1 Time Travel availability/retention must be checked for the actual
account in addition to independently stored exports. Asset object versions and
Durable Object state need their own tested recovery plan.

## Health monitoring

```sh
node scripts/launch-monitor.mjs https://YOUR_APPROVED_ORIGIN
```

The probe requests only `/api/health`, requires HTTP 200 JSON `{ "status": "ok" }`,
enforces a 10-second timeout, refuses redirects, limits the body to 4KB and exits
nonzero on failure. It reports latency and status without printing response bodies
or credentials. HTTP is accepted only on localhost for development. An Access
login page fails the check instead of being mistaken for a healthy service.

The public health endpoint checks D1 connectivity. It does not verify mail delivery,
payment settlement, invoice issuance, Wallet or push delivery, queue/cron timeliness,
assets or complete customer journeys. Keep those as separate protected operational
checks. Configure an external scheduler for every five minutes with an alert after
two consecutive failures and recovery notice. Assign an actual responder and test
the alert using an isolated failing service. No alert destination or scheduler is
activated by adding this script; do not mark monitoring accepted until a failure
and recovery have reached the responder. Protected review deployments need a
separately reviewed authenticated probe; this script does not carry Access secrets.

## Legal completion without invented information

`legalReadiness()` reports the missing seller name, valid CR, address and support
email; it is an operational completeness check, not a legal assessment. The owner
is not VAT registered: leave the seller VAT number empty and keep VAT at zero until
registration is actually obtained. No VAT number is needed to pass completeness.
Do not present invoices as VAT tax invoices or enable live tax issuance based on
this helper. A third-party account address is not automatically saved as the
platform seller identity.

Before commercial use, the owner must supply/confirm the legal entity and issued
CR, address, support contact, chosen domain and final terms. Complete the retention
schedule, privacy notice, processing agreement, hosting/transfer assessment and
commercial cancellation/refund terms with appropriate advice. Current `/legal`
remains trial/review policy text. Do not treat an approval flag, passing test or
provider account as acceptance of those documents.

References: [D1 export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/),
[D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/),
[Wrangler D1 commands](https://developers.cloudflare.com/d1/reference/wrangler-commands/).
Command syntax was checked against the project-installed Wrangler 4.156.0 help;
the documentation fetch was unavailable in this workspace session.
