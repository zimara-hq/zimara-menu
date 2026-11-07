# Phase A source review

**Source assessment: reported payload issue resolved; visual/performance verdict pending.** Read-only review of the current uncommitted `codex/next-menu-lcp` patch against main `1b2f710`. No tests, browser, Graphify, Lighthouse, detector, or provider commands were run. No screenshot packet was supplied for this phase; this is not visual approval or confirmation of LCP ≤2500ms.

## Findings

- **Resolved — Escaped bootstrap byte cap** — `src/menu-page.js:27–29` now serializes/escapes once, checks the actual UTF-8 byte length against 256KiB, and inserts that same string. `test/public-menu-page.test.js:81–86` covers 50,000 `<` characters: raw JSON fits, escaped JSON exceeds the limit, and bootstrap omission is asserted. The implementation directly resolves the reported expansion/duplicate-fetch issue. Controller reports observed RED/GREEN; reviewer read the source/test without executing it.

No unresolved material source finding remains from this review. This closes the reported issue only; it does not establish full-surface visual fidelity or the LCP target.

## Verified by source inspection

- Bootstrap content uses inert `application/json`, escapes script terminators and HTML-significant characters, checks branch identity, and has a client API fallback for absent/malformed/oversized data. Rendering still escapes public strings.
- `publicMenuContext` returns explicit existing public projections for the requested active branch. Published design remains `activeDesign`; this patch does not read private draft recipes or ticket tokens into the payload. Tests exercise public-profile equivalence, foreign-tenant separation, inactive tenants, and token/draft exclusion; these tests were read, not executed.
- Rewritten successful HTML strips stale entity/body headers and sets all three browser/CDN cache controls to `no-store`; shell conditionals are removed. API caching remains covered by existing middleware. Error/non-HTML asset responses remain untouched.
- Build tooling minifies the existing shared modules and ordered CSS into stable menu entry assets; studio editing remains a conditional external dynamic import. Freshness checks are included in test/build workflows. Removing the QR vendor script has no identified remaining menu consumer in the inspected code.
- Image hints and rendered srcset share one bounded descriptor, honor image visibility, and follow rendered category order. Server price labels preserve the existing minor-unit/locale format and fall back to client formatting for unlisted totals; checkout calculations are unchanged.
- Font CSS separates the Latin critical face from the extended fallback rather than claiming Arabic coverage. Actual glyph coverage, synthesis/metrics, and visual identity still require the supplied browser/font evidence.

## Untested release checks

Confirm exact PR36 appearance through the screenshot packet, including Arabic/English and extended Latin names. Exercise native category links, search/focus restoration, and category highlighting after offscreen `content-visibility` activation; the DOM remains present, but source alone cannot verify resulting scroll geometry. Confirm preview editing still imports correctly in the minified bundle. Inspect cold-navigation LCP/transfer results after the controller's serial measurements; the new server envelope waits for public reads before returning HTML, so measured TTFB matters as well as reduced client requests.

## Follow-up scope

The controller also changed first-screen image loading to four eager items and shared category-ordered preload hints. The changed source was inspected as part of this packet; runtime scheduling, transfer impact, and unchanged layout await controller measurements/screenshots. No additional test/browser/Graphify work was run.
