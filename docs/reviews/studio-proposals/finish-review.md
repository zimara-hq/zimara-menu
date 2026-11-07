# Studio proposals finish review

Date: 2026-11-07. Independent, bounded Impeccable finish review of phase 2B, an Operate extension of the existing studio. No source changes, test runs, browser sessions or performance runs were performed by this reviewer.

## Disposition

**SHIP for this bounded finish-review scope.** F1 is resolved in the final recaptures. No unresolved release blocker was found in task usability, accessibility, privacy or draft-only behavior within the reviewed scope. Release remains subject to the primary agent's final-head verification and deployment gates.

## Resolved finding

**F1 — New direction entry and mode text were unreadable in dark mode (resolved).** In `public/studio-proposals.css`, `#st-propose`, `.ideas-heading .eyebrow` and `.ideas-mode` use `var(--accent)` as foreground. The actual dark captures show almost-black violet text against dark plum surfaces. This affects the entry action and the explicit “Local matching” disclosure in both the brief and comparison, rather than merely decoration. Evidence: `after-390-dark.png`, `after-1440-dark.png`, `brief-390-dark.png`, `brief-1440-dark.png`, `comparison-390-dark.png` and `comparison-1440-dark.png` in `docs/screenshots/studio-proposals/`.

The correction uses the existing theme-aware readable `--ink` role for these foregrounds and an existing `--ink`/`--bg` pair for the selected page control. Independently inspected the regenerated after/brief/comparison captures at both 390 and 1440 in both light and dark (12 affected PNGs): the entry action, eyebrow, brief/result mode disclosure and selected page label are now clearly readable. Layout and tenant recipe colours remain consistent with the original packet. The primary agent reports that a browser assertion verifies at least 4.5:1 for the dark entry/eyebrow/mode text and all 14 journey checks pass; this reviewer did not run those checks.

## Review evidence and boundaries

Read `PRODUCT.md`, `DESIGN.md`, `UX-CONTRACT.md`, the phase 2B plan, the applied Impeccable new-work finishing guidance, `public/studio-proposals.js`, its CSS, `public/brand-palette.js`, `src/studio-proposals.js`, the design-studio integration and focused unit/browser test sources. Visually inspected all 16 actual before/after/brief/comparison PNGs at 390 and 1440 in light and dark. `capture.json` describes matched synthetic fixtures, real stored themes, reduced motion, settled fonts/images and no CSS overrides. These screenshot claims were assessed as supplied evidence; this reviewer did not independently recreate the captures.

The after views preserve the incumbent canvas and content. The three comparison cards show distinct real structures and the same merchant content. Desktop exposes all three choices; mobile uses normal vertical flow, with the close action and brief controls contained in the viewport. The new entry adds a mobile toolbar row but does not clip the task. No identity replacement or unsolicited redesign is warranted.

Source review supports the intended boundaries:

- The native modal has an accessible name/description, explicit close control, return-focus cleanup, keyboard entry without animation, reduced-motion handling, visible labels and status feedback. Preview frames are inert, hidden from assistive technology and removed from tab order; iframe readiness gates applying.
- Logo analysis is local raster-only processing with byte/dimension/sample bounds, readable swatch text and released bitmap/object-URL/canvas resources. Proposal requests contain words, derived HEX values and a revision, without the logo file. There is no new browser-storage draft persistence.
- Server endpoints require the owner role and use the authenticated tenant. Inputs and provider output are bounded; three distinct frames/layouts are validated. Demo mode cannot call the paid provider; fallback is explicitly local. Provider requests omit merchant content and account identifiers.
- Generation preserves draft home/menu content and has no design write/publication endpoint. The existing editor flushes/saves pending edits before requesting directions; applying explicitly uses the revisioned private-draft endpoint and records undo state. The publication flow stays separate. Generation/error/collision handling retains the brief and avoids overwriting a concurrent saved draft.
- Focused test sources cover local/provider/fallback/tenant/revision boundaries, no logo upload, real iframe recipes, draft-only apply, retained failure input, keyboard/modal behavior, responsive fit and preservation of all 20 authored thumbnails. Actual pass/fail results and performance conclusions belong to the primary agent's rerun evidence.

This is a focused finish review, not a comprehensive accessibility certification or security audit. No live external provider was exercised.
