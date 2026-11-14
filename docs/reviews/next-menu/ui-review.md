# Phase 1 client, owner and performance integration review

Reviewed the shared phase-1 source and `review-phase1-ui.diff` against Global Constraints, Review Focus and Tasks 2–5 in `docs/NEXT-LEVEL-PLAN.md`, and the phase-1 user prompt. This report includes the independent rereview of the current client fixes. Backend findings are recorded separately in `server-review.md`; their closure is owned by the separate backend reviewer.

**Spec verdict: pass within the reviewed phase-1 client/owner integration scope.** The three findings below are now closed with source inspection and independent local browser evidence. Compact browsing, explicit discovery, details, owner persistence/publication and the recorded local performance work have substantive evidence. This is not a declaration that the final-head CI, deployment, merge or every tenant/font combination has passed.

**Quality verdict: pass for the reviewed changes; no remaining confirmed P1/P2/P3 findings.** The original price/focus defects and long-name fitting gap have been addressed. Narrow regression diagnostics exercised real synthetic Worker APIs, including a new price-change race after refresh. No source or provider configuration was changed by this reviewer; no broad suite was repeated.

## Independent rereview evidence

Current locations: `public/menu.js:103` (details focus restoration), `public/menu.js:208` (quote comparison), `public/menu.js:212` (cart redraw retaining input nodes), `public/menu.js:290` (submit and expected total), `public/menu.js:459` (name fitting), `public/menu.js:489` (refresh), and `src/features.js:1022` (optional server quote check).

- **P1 closed:** the refreshed cart now redraws line prices, total and submit handler while reusing input nodes. Independent local browser assertions changed an item to1900 and observed19.00 while the same note DOM node, focus, selection range2–5 and note text survived. Send remained disabled until the explicit review action.
- **Additional price-race integration passed:** after review, a second real owner price change to2100 before the next refresh caused `409 price_changed`; the client fetched current data, displayed21.00 and required review. The reviewed retry returned201 with server total2100. `expected_total` is an optional comparison, never a price source. Source inspection and the focused two-test contract preserve legacy callers and return an existing idempotent receipt before validating today's quote.
- **P2 closed:** independently focused an existing details button and changed another item's description; refresh retained that button's focus. Hiding the focused item then refreshing moved focus to search instead of BODY.
- **P3 closed:** independently changed a real merchant's English name to a long value; fitted heading size changed16→14px, respecting the readable floor. Opening the business-information disclosure exposed the exact full name. Fitting observes container size, heading text and loaded fonts. The Arabic/Latin mixed-name case is also asserted in the updated customer journey.
- `ui-rereview-diagnostic.json` records these results. The first diagnostic passed all pricing/focus assertions, then its name setup received400 because the owner org PATCH requires both localized names. That was a fixture mistake, not an app finding; a corrected name-only fixture (`demo-n3orupa0obu-hail`) then passed. No full suite was rerun.
- Viewed `review-final/customer-390-dark.png`: the page visibly uses the actual dark merchant palette. The updated browser code publishes light and dark recipes and asserts computed `--surface` before capturing all eight width/theme screenshots. The earlier theme-attribute-only evidence is superseded.

## Final name-fitting optimization review

Quality verdict remains **pass; no new blocker found** for the small change at `public/menu.js:459`. The function now removes the inline font size in one animation frame, then measures native `scrollWidth` in the following frame. That measurement reflects the actual rendered font and CSS text layout. The bounded shrink calculation, 14px floor, full-name disclosure, text observer and fonts-ready trigger remain. The ResizeObserver checks width changes, so height changes caused by fitting do not repeatedly restart the measurement. Cancelling the tracked animation-frame ID also coalesces pending measurement work.

This final delta received **source-only independent review**. The controller reports the complete customer E2E passing under `review-optimized`; this reviewer did not rerun a browser, Lighthouse or CPU measurement while the sequential Lighthouse run was active. Earlier independent browser results above remain evidence for the behavior before this measurement optimization, not a claim of a separate browser rerun on this exact delta. No performance improvement is inferred solely from the source review.

## Final initial-layout stability review

Quality verdict remains **pass; no blocker found** in the small loading-state delta: `public/menu.html` now supplies `body.menu-page`, `main.wrap.menu-wrap`, an initial busy state and bilingual visually hidden loading status before JavaScript runs. `public/menu-next.css:94` reserves a minimum viewport-height content area without imposing a fixed height or clipping loaded content. `public/menu.js:444` clears the busy state after normal/empty rendering, and the error path clears it at line453 before installing the retry view. Existing menu behavior is retained.

This delta received source-only independent review; no browser or CPU measurement was started. The controller reports the complete customer E2E passing in `release-customer`. Independently read `performance-stable/summary.json`: timestamp2026-11-05T23:36:13.341Z, local synthetic fixture `demo-qeladkefvao-hail`, **94 performance / 100 accessibility / 91 SEO**, **132,221 encoded non-image bytes**, runtimeError:null and no warnings. These current recorded measurements supersede the earlier95/100/91,130,778-byte reference for this later implementation. They remain local recipe measurements with the same custom-font, remote-preview and indexing limits; no Lighthouse rerun is claimed by this reviewer.

## Closed findings — original reproductions retained for traceability

### CLOSED P1 — A refreshed price can be submitted while the customer still sees the old total

Location: `public/menu.js:445`, `public/menu.js:448`, `public/menu.js:452`; retained submit closure at `public/menu.js:274`.

When a refresh arrives while focus is inside `#cart`, new item data replaces the old data but `render(true)` deliberately preserves the old cart DOM and submit listener until focus leaves the cart. Moving from the note field to Send remains inside that cart, so the listener submits the old selection without displaying the new total. The server correctly prices current data, producing a different total from the one the customer just approved.

Actual reproduction, synthetic room `demo-vbjxeklbybi-hail`: enable orders, add Espresso at 900 minor units, focus/fill `#order-note`, PATCH that item to 1900, trigger the existing online refresh and wait for its response. `.cart-sum` remained `Total / SAR 9.00` with `order-note` focused. Clicking Send created a pending order whose response had `subtotal:1900,total:1900`. This is a price presentation/consent failure, not a server price-tampering vulnerability; no live payment occurred.

Original requested fix (now implemented): retain the user's input/focus while refreshing the line prices, totals and submission state. Submission must not use a stale selection/quote after a completed refresh. Add a browser regression that changes a real local item price while the note is focused, then submits without leaving the cart.

Related availability diagnostic (`ui-refresh-diagnostic.json`, room `demo-uqyappm1dtu-hail`): with two items and focused note, hide one item then refresh. The first Send still included the unavailable item and returned `400 item_unavailable`; the second attempt succeeded with the available item. Do not claim invalid items were accepted or that retry failed forever: neither occurred. Both symptoms arise from the same stale checkout snapshot and should be addressed together.

Original unmet requirements (now satisfied by the reviewed fix): Review Focus 2, Task 2 refresh/cart behavior, and preserved pricing/checkout compatibility.

### CLOSED P2 — Periodic refresh removes keyboard focus from a product details button

Location: `public/menu.js:103` through `public/menu.js:115`, called by `public/menu.js:452`.

`render()` replaces the whole product list but only remembers/restores `data-add`. A focused `data-detail` button is removed even when the same available item remains in the new response. Keyboard users lose their place whenever any compared item/category field changes.

Actual reproduction in the same synthetic room: focus the first `[data-detail]`, change its description through the owner API, trigger online refresh and wait for completion. `document.activeElement` became `BODY` with no item identifier. The item remained available. Existing browser coverage checks search and checkout focus, so it does not catch this card-navigation case.

Original requested fix (now implemented): restore the matching details control when it survives; provide a sensible nearby fallback when the focused item disappears. Add a focused browser assertion for an unrelated item update while navigating details buttons.

Original unmet requirements (now satisfied by the reviewed fix): Global Constraints keyboard support and Task 2 focus retention/accessibility.

### CLOSED P3 — Long merchant names are truncated rather than automatically fitted

Location: `public/menu-next.css:7`.

The heading uses viewport-based `clamp()` plus `overflow:hidden;text-overflow:ellipsis`. Its font size does not respond to the actual name length. In the supplied `customer-390-dark.png`, the injected long restaurant name visibly ends in an ellipsis. The full heading text remains available to assistive technology, but the customer cannot read the full displayed identity. The browser test asserts only one-line height, which passes truncation.

Original requested fix (now implemented): implement a bounded name-length/available-width fitting behavior (with an explicit accessible way to reveal any remainder), and assert the intended fitting behavior for long Arabic and Latin names. The user explicitly requested automatic shrink-to-fit; merely keeping one line does not establish that requirement.

Original unmet requirement (now satisfied by the reviewed fix): the phase-1 first-screen instruction, “اسم المطعم بسطر واحد (يصغر الخط تلقائيًا لو الاسم طويل)”.

## Verified implementation and evidence limits

- Viewed `customer-grid-ordering.png`: four image-grid cards fit the 390×844 screen, with visible direct-add actions. Recorded first-card position is y328.625 and height225.453125. Thin cover, identity row, collapsed description and search/category controls are present. This establishes the specific grid fixture, not every possible content/recipe at every zoom level.
- Reviewed customer test code and reports: explicit dietary fields, missing-calorie exclusion, actual `orders_today` sorting, merchant/order recommendation source labels, details with ordering disabled, existing options/allergens, cart persistence, failed refresh, English and legacy ordering/pager/studio journeys have focused coverage. Server pricing remains authoritative. No public branch event/private QR subscription was added.
- Grid/list/text use the canonical published recipe. Default font substitution matches Tajawal/Jakarta family names; other selected/custom families remain in their own recipe path. Existing tenant-studio evidence covers ten frame geometries. This review did not freshly test every uploaded font, every frame/layout combination or 200% zoom.
- Corrected current visual evidence is under `review-final/customer-{360,390,768,1440}-{light,dark}.png`, using actual published palettes as described above. Canonical tenant colors remain merchant-owned. Reduced-motion coverage sets the preference and inspects layout; it is not a comprehensive animation/keyboard audit.
- Owner report and test establish actual upload transport with decoded 320/640/960 WebP widths, explicit dietary/complement persistence, preserved ordinary item fields, branch schedule save/reload/clear, foreign IDs rejected, and private draft versus published layout in an independent public page. A suspected relative gallery URL issue was specifically disproved: item forms use `novalidate`; the real Save sent a PATCH and persisted the changed name. `ui-gallery-diagnostic.json` records this negative finding. Do not report it as an editing failure.
- Viewed `art-contact-sheet.png`: all 27 café/restaurant illustrations are food-specific and distinct. Asset tests/provenance record original SVG and responsive WebP files attached only to new samples; no tenant reseeding is claimed.
- Raw final Lighthouse/transfer evidence and `docs/PERFORMANCE.md` support **95 performance / 100 accessibility / 91 SEO**, **130,778 initial encoded non-image bytes**, using the direct indexable local Worker, Arabic/light published grid and default Tajawal/Jakarta aliases. The harness includes fonts, scripts, styles and APIs in its bounded cold-navigation window; no audit exclusions were used. These are actual local reference measurements from the earlier performance run, not automatically measurements of the latest price/focus/name code or all-custom-font/HTTPS-release guarantees. Any final-head performance claim should identify a corresponding rerun; this review did not rerun Lighthouse. Preview noindex remains intentional. Baseline/final recipe differences and variable CPU benchmark are disclosed; no controlled speed-ratio inference is warranted.
- Node >=24 and both new customer/owner journeys are added to CI. Required final-head CI, remote isolated review deployment, HTTPS smoke, final Graphify refresh and merge remain controller-owned release gates. No claim that phase 2–7 is complete.

## Review method

Read `/workspace/AGENTS.md`, project `CLAUDE.md`, toolkit readiness limitations, the supplied requirements/reports/diff and graph-located source. Graphify was queried before source investigation. Used the local engineering code-review skill's separate spec/quality approach within the assigned single-reviewer scope; no children spawned. Only synthetic local browser/API diagnostics and this report/evidence files were written. Independent rereview is complete. All three original findings are closed; the controller retains final release gates and any final-head performance rerun.
