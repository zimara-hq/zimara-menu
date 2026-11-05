# Subscriber workbench and functional recovery

This release replaces the subscriber's long form stack with a working site editor and fixes independently reproduced subscriber failures. It preserves the existing Worker, tenant boundaries, design recipes, private drafts, publication and provider gates.

## What changed

| Before | After | Why |
| --- | --- | --- |
| Every homepage section exposes its own long form in one stack | A section outline, actual guest-page canvas and one selected inspector | Keep the edited section and its result in view |
| A section is edited by finding its form | Click its preview or outline row; add through a named native dialog | Make selection direct and keyboard accessible |
| Changes can only be manually reversed | Bounded in-memory undo/redo, typing coalescence and native text undo retained | Recover from reordering, deletion and content mistakes |
| Phone editing requires scrolling between controls and preview | Canvas, section list and properties switch without recreating the data | Preserve work across phone views |
| A template trial can be confused with an applied design | Explicit private trial bar; apply before Publish becomes available | Avoid publishing the wrong recipe |
| Brand saves can claim success while a saved recipe overrides them | Name/logo remain independent; appearance routes to the revisioned Design studio | One owner for colours, layout and typography |

The outline supports drag-and-drop and labelled arrow controls. The section library restores focus after Escape. Editor tabs support RTL/LTR arrows, Home/End and a single tab stop. Keyboard undo does not intercept typing fields. Tablet preview starts at tablet width; phone controls use touch-sized targets. The public page has no editor selection attributes. Opening the published page is a separate action.

`/demo?view=studio` creates an isolated two-hour room and opens its owner editor directly after the user's button press. `/demo` retains its cashier/display/customer role chooser. The public headline now identifies the menu product directly. Service catalogue examples use service content instead of showing a café photograph for every business type. The catalogue remains **100 structural combinations**, not 100 separately art-directed sites.

## Reproduced failures fixed

- Creating an item with `active:false` stored the default `active=1`. It now preserves hidden status and stays out of the public menu.
- Re-rendering owner Menu added another delegated click listener. A single add-option action produced multiple groups. Listeners now belong to replaced forms; Chromium verifies four re-renders remain single-action.
- Expired trial, suspended, cancelled and expired active subscriptions could not reach checkout or sync because the generic write lock blocked recovery. Only owner billing recovery and billing-profile endpoints bypass that lock; auth, role, active organization, tenant identity and provider verification still apply. Ordinary menu writes remain locked. Tests use a fake verified provider, never a live payment.
- Legacy Brand colour/layout/system-font saves could be ignored by a saved recipe. Saved recipe ownership is explicit, including older rows with migration revision zero. Legacy appearance mutations return a clear conflict; unchanged values, name/logo and non-appearance profile fields remain usable.
- An uploaded font was only registered when the legacy profile selected it. Availability is now independent of selection, so the recipe can select it; a file upload alone does not silently replace an active IBM recipe. Replacing a file already selected publicly remains immediate and is disclosed.
- Magic Start preview/publication ignored the chosen colour and conflicted with recipe ownership. Its chosen colour stays local until explicit Use and publish; apply/save/publish carry successive revisions. Existing homepage/menu copy remains intact.

## Verification

- 128 node unit/integration tests pass, including recovery states, hidden item creation, legacy appearance ownership and deep bounded history.
- New browser coverage: workbench selection/editing, keyboard tabs and dialog recovery, reordering and drag, add/delete/undo, private versus public state, template preview without mutation, phone views and failed-save recovery blocking publication; canonical colour/layout/custom-font publication; repeated Menu rendering; Magic Start with first-time and existing recipe owners.
- Existing local suites passed: workspace, resilience, design, tenant-studio, agency, connected customer/cashier/display journey and magic. Required new suites run in CI.
- Worker dry run and preview packaging pass. No new dependency or database migration.
- Taste reviewed actual desktop/tablet/phone, English/LTR, dark and reduced-motion pictures. The visual review is not a certification: the recorded second-round meter reported three failures, including a hidden legacy shell heading and clipped text inside the intentionally scrolling editor tabs. Focus return, visible heading, tablet sizing and readable labels were fixed. Detailed local evidence: `output/workbench/visual-review/review.md`.
- Premium static scanner reports 66 heuristic findings (64 literal-button binding detections and two textarea detections). This is not a clean scanner result. New controls have actual delegated actions and browser coverage; the selected inspector's textarea is vertically resizable.

All local data is synthetic. No external email, payment, POS, messaging or Wallet service was activated. Provider readiness still reflects actual credentials and verification. Source attachments inform the backlog; this release does not claim all 325 competitor capabilities are built. The supplied video exceeded the transfer tool's 32 MiB limit and was not reviewed.

## Review and rollback

Use `/demo?view=studio` for the editor, `/app?studio=home#design` for an authenticated homepage editor, `/app?studio=identity#design` for appearance and `/demo` for the operational journey. Existing published recipes and URLs remain compatible.

Deploy only through the existing protected review Worker pipeline. This release changes no production DNS, institution website, owner/MFA credentials or provider secrets. Roll back to the preceding review Worker version if remote checks fail; no data rollback is needed.
