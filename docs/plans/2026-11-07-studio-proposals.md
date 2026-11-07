# Studio proposal comparison — phase 2B

Base: main0f0cb5a (PR37 merged, CI green, protected review deployment and HTTPS journeys verified). Branch: `codex/next-studio-ai`. Preserve existing studio,20curated previews, tenant content and bounded recipe engine. This is an Operate extension of PRODUCT.md/DESIGN.md, not a replacement design world.

## Boundaries and tasks

1. **Backend recommendation boundary** — `src/studio-proposals.js`, focused `test/studio-proposals.test.js`; register from `src/app.js`. Owner-only tenant-scoped config/proposals endpoints; three structurally distinct normalized recipes; preserve current draft home/menu content, optimistic revision checks, no write or publish on generation. Local bilingual word/palette matching is named local. Anthropic only behind explicit `STUDIO_AI_ENABLED` and secret; demos always local; bounded transport, rate limits, validated IDs/colors and truthful local fallback. All provider tests use stubs, never bill a real account.
2. **Local logo processing** — `public/brand-palette.js`, `test/brand-palette.test.js`. PNG/JPEG/WebP magic/size/dimension checks, bounded browser-only canvas sampling, no upload or external service, up to five colors. WCAG ratio and black/white readable text, including midpointgray edge case.
3. **Studio comparison interaction** — `public/studio-proposals.js` and scoped CSS. Existing studio gains an entry button; native accessible dialog with description and logo input, clear actual mode, loading/error/retry states, three real recipe iframe previews (inert/read-only), palette/contrast evidence, explicit draft apply. Keyboard/RTL/mobile first; SVG icons only; semantic platform tokens and reduced motion. Main studio callback flushes pending edits, uses revisioned draft endpoint, records undo state, and leaves publication unchanged.
4. **Integration and acceptance** — new Playwright journey in CI: local mode, logo extraction with no upload, three different structures using actual content/colors, no mutation on generation, draft-only apply, keyboard close/focus, errors/retry, mobile/desktop and existing20thumbnails. Re-run relevant existing studio/customer journeys, `npm test`, builds and cold Lighthouse against prior recipe; capture before/after light/dark, review independently, update Graphify. Document flag activation as Cloudflare dashboard steps in AZ-ACTIONS.md without terminal commands.
5. **Release gate** — PR with raw results, screenshots, attributed competitor table, Az steps and rollback. Final-head CI green before merge; protected review deployment and HTTPS verification before phase3. No external provider activation, DNS, institution Worker or commercial data change.

## Decisions

- Palette extraction sends only derived HEX values to our owner endpoint. It does not change the live company logo; logo publication stays in the existing identity flow.
- Generated recipes keep even disabled homepage content and existing menu copy; no illustrative replacement without explicit owner choice.
- Each of three structures has a different frame/layout. Preview shows the actual merchant data, not a recolored static thumbnail. Existing20authored catalogue thumbnails are reused unchanged.
- No paid key is enabled or exercised during this task. Missing key/disabled flag/demo room has an explicit local-mode reason; no claim of AI integration from installed files.
- Typography, spacing and motion follow the existing studio. New dialog has visible labels,44px targets, native focus containment, inert decorative iframes, status messages and exact-state retry; no keyboard animation.
