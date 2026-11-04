# Observable UX contract

Source: current user brief, PR1 lifecycle, server routes and migrations. Business rules live in server modules, not in this contract.

## Workspace discovery and recovery
- `workspace-finder.js` is the navigation-search variant of the established workspace shell. It receives only that role's existing tabs; selecting a result goes through the same `canLeaveWorkspace` guard. It never issues a data mutation. Native dialog owns background isolation; the component owns search, IME handling, arrow/Enter navigation, Escape, clear/no-results and trigger-focus restoration. Ctrl/Cmd+K is optional and does not intercept typing in form fields.
- `dashboard.js` retains canonical `forms.js` editing/confirmation and `common.js` feedback. Section-load errors keep navigation usable and provide a retry of the original section. Loading exposes `aria-busy`; error titles describe the failure and retry restores the section title.
- Owner branch summaries use `/api/owner/branches` and `/api/owner/stats` (30-day totals), without generating private display credentials. A public-menu preview opens the established `/m/:slug` route. Setup percentage describes configuration tasks only, not provider activation.
- `journey-preview.js` is explicitly illustrative, keeps ready/acknowledged/collected separate, and never creates a real order or notification. Its live-demo destination remains `/demo`. Previous/reset are reversible and keep the interaction keyboard-accessible; reduced motion disables the entrance animation.

The implementation review and verification evidence for this slice live in `docs/BRAND-WORKSPACE-20261105.md`.

- Owner signup creates an isolated tenant and trial; verification status remains truthful when no email provider exists. Login exposes validation and recoverable errors and permits password managers/paste.
- Cashier creates a numbered ticket. Private device display shows the latest unlinked QR. Linking hides the display QR; ready, seen and collected are distinct persisted states. Two cashier sessions resolve stale-version responses rather than double applying.
- Public profile and menu never leak ticket QR/bearer tokens. Private display access can be revoked without invalidating public menu links.
- Loyalty uses append-only ledger and idempotent server actions. Balance/reward availability comes from the server. Redeeming must disappear after reload and cannot overdraw concurrently.
- Forms preserve input on failure, disable duplicate submit, show localized correction text. Actions use shared native buttons/links and app-owned dialogs, not alert/prompt/confirm.
- Tables are bounded by API limits, overflow usable on narrow devices; no fixed viewport clips long forms. Search no-results is distinct from load errors.
- Integration cards distinguish not built / needs credentials / configured / live verified. Checkout fails closed without a real provider; no success-page entitlement activation. Invoice empty state is not a tax document.
- Operate routes use AR RTL or EN LTR, light/dark, keyboard and reduced motion. Status changes announced politely. High-risk controls explain consequence; no invisible implied consent to messages.
- Demo data is synthetic, room-scoped and expires. Role links explain that room members share demo controls. It is never presented as commercial authorization.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | Native select | DESIGN.md and public/styles.css | OS-owned popup; no authored geometry promise | workspace and resilience browser tests |
| Date | Native time fields and Intl.DateTimeFormat | public/branch-settings.js; Asia/Riyadh | OS-owned picker; localized Gregorian display | overnight hours API test and workspace browser test |
| Form | public/forms.js | This contract; server validation remains authoritative | Guarded owner identity/profile/branch forms; legacy forms migrate separately | test/e2e/resilience.mjs |
| Scrollbar | public/styles.css | DESIGN.md runtime tokens | Natural document flow; table-only overflow | mobile workspace and resilience browser tests |
| Toast | common.js announce | This contract | Polite status; errors also remain inline | workspace, onboarding and resilience browser tests |
| CRUD | dashboard navigation and forms.js confirmation | src/context.js, src/app.js, src/features.js | Save stays in editor; creates return to owning list; reversible branch disable requires confirmation | connected journey and resilience browser tests |

## Editing and recovery

Guarded forms retain unsaved values in memory only. Tab changes, header navigation, locale changes and logout ask before discarding them. Browser unload uses the browser's narrow beforeunload mechanism. A successful server-confirmed save clears the guard; partial failure does not. Pending saves block duplicate submits and navigation. No passwords or drafts are written to browser storage.

Invalid fields expose a localized message, aria-invalid and aria-describedby; submit focuses the first invalid field. Existing native selects and time pickers keep OS interaction. Branch disabling is reversible and does not delete data or alter slugs. Account access changes end old staff sessions according to the existing API contract.

The cashier order inbox polls while mounted, preserves invoice input while unchanged orders refresh, distinguishes connection failure from an empty inbox and re-reads server state after mutations or stale conflicts. New-order audio requires an explicit user action and an open page; no lock-screen or delivery guarantee is implied. The server still owns price, order version and pager creation.

Cashier accept/reject waits for an in-flight read, prevents duplicate gestures and rechecks that the view is still mounted before dispatch. This is in-memory coordination, not offline queuing or background submission.

## Merchant site ownership
Homepage block composition and menu-page presentation are edited in the design studio and published together through the existing design endpoints. Product data, branch contact/hours, logos and uploads remain with their existing owners. Optimistic draft revisions reject stale writes. Failed saves preserve local input and block publishing. Cashier capability controls are branch-scoped, audited and enforced by `requireRole` on the server, not only hidden in the client. Existing accounts retain their prior access until the owner saves restrictions.
