# Operational polish: owner controls and cashier orders

Builds on the subscriber workspace in PR #19 (`0b9e391`). The existing identity palette, original symbol, public-menu/cart flows, Rewaa/Fatoora adapters and mail integration remain in place.

## Changes

- Shared guarded editors retain unsaved identity, profile and branch changes until server-confirmed save or explicit discard. In-app navigation uses an accessible app dialog; actual browser unload uses beforeunload. Pending saves prevent duplicate submission/navigation, and field errors identify and focus the affected field.
- The owner can rename branches, change review links, deactivate/reactivate without changing slugs, change cashier passwords and enable/disable cashier access. Existing server permissions remain authoritative. Branch updates now create audit records. Account access changes still invalidate existing sessions.
- Creating an additional branch updates the directory without discarding edits in other branch forms. Demo-room account creation explains the existing `@demo.invalid` restriction.
- Cashier menu orders refresh every five seconds while the view is mounted. The inbox preserves invoice-number input during refresh, distinguishes connection failure from empty state, supports retry/filtering and re-reads authoritative state after accept/reject/conflict. The server bounds the list to 200 recent orders over twelve hours. In-memory tracking is bounded to the current response; no draft is written to localStorage.
- Accept/reject waits for an in-flight refresh instead of dropping the gesture; leaving the view before dispatch cancels that pending gesture. The browser test deliberately delays a poll and verifies the resulting single acceptance.
- New-order audio requires an explicit action and an open page. It does not activate Web Push/Wallet or promise delivery/sound on locked devices.
- Operational branch/inbox screens inherit the existing ZIMARA palette. Narrow navigation retains the selected tab when the layout changes. Public customer pages keep tenant branding.

## Verification

Isolated local D1, synthetic rooms/users, no Resend credential and no paid provider calls:

- 74 unit/API tests passed, including tenant-isolated, audited and reversible branch updates.
- Workspace suite: nine acceptance groups passed, including all thirteen owner sections and saved public rendering.
- Resilience suite: nine acceptance groups passed, including field errors, discard/cancel, injected 503 save failures, retry, branch/account access, preserving edits when creating a branch, automatic order arrival, invoice preservation, stale conflict and connection recovery.
- Connected customer/cashier/display journey: fourteen checks passed.
- Actual registration/import/profile/order-acceptance browser suite passed.
- Worker dry-run and embedded preview build passed; new/changed modules passed syntax and formatting checks. The resilience suite is included in CI.
- DESIGN.md lint: zero errors, one existing-format warning because the maintained runtime-first guide has no YAML frontmatter.

The premium static audit was executed in strict mode against `public/`: no unresolved ownership decisions; 42 reported findings remain in the raw report. Forty-one are literal-button checks that do not resolve this application's JavaScript/delegated handlers, and one requires a literal textarea rule despite the existing global `resize:none` owner. This is **not a clean static-audit result or a claim of complete accessibility conformance**. Project-owned browser checks verify the changed interactions, with the runtime reports retained in `output/polish/` and CI artifacts.

## Release and rollback

Update the existing isolated review Worker only after CI passes. No new migration is needed for this extension; the previously applied `0013_workspace_identity.sql` remains. Preserve all existing secret bindings and mail/runtime settings, including Resend, sender, URL and zero VAT. Do not read secret values, send customer test emails, alter DNS or touch the institutional Worker/production databases.

Previous preview version for rollback: `a850e40f-e8d7-41df-8a6e-7d5edf1b9ddf`. Restore code/config without deleting data. Record the new exact source SHA, package SHA-256 and deployed version in the PR after HTTPS verification. Real-device audio/push, commercial payment, Wallet and provider credentials remain outside these tests.
