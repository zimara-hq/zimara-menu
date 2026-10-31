# Observable UX contract

Source: current user brief, PR1 lifecycle, server routes and migrations. Business rules live in server modules, not in this contract.

- Owner signup creates an isolated tenant and trial; verification status remains truthful when no email provider exists. Login exposes validation and recoverable errors and permits password managers/paste.
- Cashier creates a numbered ticket. Private device display shows the latest unlinked QR. Linking hides the display QR; ready, seen and collected are distinct persisted states. Two cashier sessions resolve stale-version responses rather than double applying.
- Public profile and menu never leak ticket QR/bearer tokens. Private display access can be revoked without invalidating public menu links.
- Loyalty uses append-only ledger and idempotent server actions. Balance/reward availability comes from the server. Redeeming must disappear after reload and cannot overdraw concurrently.
- Forms preserve input on failure, disable duplicate submit, show localized correction text. Actions use shared native buttons/links and app-owned dialogs, not alert/prompt/confirm.
- Tables are bounded by API limits, overflow usable on narrow devices; no fixed viewport clips long forms. Search no-results is distinct from load errors.
- Integration cards distinguish not built / needs credentials / configured / live verified. Checkout fails closed without a real provider; no success-page entitlement activation. Invoice empty state is not a tax document.
- Operate routes use AR RTL or EN LTR, light/dark, keyboard and reduced motion. Status changes announced politely. High-risk controls explain consequence; no invisible implied consent to messages.
- Demo data is synthetic, room-scoped and expires. Role links explain that room members share demo controls. It is never presented as commercial authorization.
