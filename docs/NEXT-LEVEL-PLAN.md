# Customer Menu — Next Level Implementation Plan

> **For agentic workers:** use `superpowers:executing-plans` to implement each assigned domain natively with test-first steps. The controller uses `dispatching-parallel-agents` for independent file ownership and provides fresh reviews; workers do not dispatch children. No phase beyond phase 1 starts before phase 1 is green and merged.

**Goal:** make the existing customer menu compact, distinctive, accessible and useful on the first mobile screen, with truthful discovery and complete product details.

**Architecture:** retain Hono/D1, existing pricing, sessions, recipes, cart and pager flows. Extend the existing item model and public menu response; isolate discovery rules, customer rendering, owner controls and original sample artwork into small modules. Preserve canonical draft/publish appearance ownership.

**Tech Stack:** Node >=24, Hono4, Cloudflare Workers/D1, vanilla ES modules, node:test, Playwright, Lighthouse.

**Spec:** `docs/plans/codex-next-level-prompt-2026-11-05.md`, master-plan sections3/4/9/10, and review section3 (14 findings). Read from `claude/project-thread-gmeb0h`; master SHA256 matches the uploaded file ending `3.md`.

## Global Constraints

- Current base: main `ac3865ce6394ae816f61a6107daef3d491e27a6c`; branch `codex/next-customer-menu`.
- Arabic RTL first; full English; 360/390/768/1440px, light/dark, keyboard and reduced motion.
- Platform identity Indigo #23003f, Violet #8447F2, Ember #F94500, Lavender #BCACCE, Solar #FFFDB4, Paper #faf8fb; Tajawal + Plus Jakarta Sans. Tenant pages retain the merchant's recipe/colors/fonts.
- No free CSS, fake popularity, inferred gluten-free status, fabricated data or external-provider activation. Demo payment guard remains unchanged.
- No purchases, live invoices/mail, DNS, institutional Worker/database changes, production seeds or resets. Synthetic local/demo data only.
- Existing APIs, cart selectors, option groups, server pricing, tenant isolation, cashier permissions and private QR boundaries remain compatible.
- Root updates Graphify after the coordinated source change; workers never race graph writers. Every PR names the requested skills and carries real before/after evidence.
- Marketing claims in the owner's competitor report are attributed research inputs, not independently verified current vendor features or proof of superiority.

## Review Focus

1. Long Arabic/Latin names, translated text, zoom and custom recipes must not hide search/first items or force horizontal page scrolling.
2. Unavailable items, a schedule changing while a cart is open, retries and a failed refresh must preserve receipts and never accept invalid items.
3. Unknown calories/allergens and zero order history must remain unknown, not silently become healthy/free-from/popular claims.
4. Gallery URLs, complement IDs and branch/category IDs must not escape tenant scope, introduce SSRF, inject markup or disclose private ticket data.
5. Custom fonts/photos may change transfer cost; report actual measured environment/recipe and retain preview noindex protection instead of gaming Lighthouse.

## Review mapping and phase gates

| Review finding | Phase | Acceptance |
| --- | --- | --- |
|1 name/header too tall|1|one-line fitted name, thin cover, disclosure for description, first product visible at390×844|
|2 card gaps/unequal heights|1|stable media aspect ratio, equal grid rows, no blank photo column in text mode|
|3 missing direct add|1|44px+ add target on cards when ordering enabled; details remain accessible with ordering off|
|4 repeated demo pictures|1|every demo item has distinct appropriate original art, with asset provenance|
|5 studio gate page|2|direct editor entry, preserving room isolation|
|6 inline editing/canvas size|2|text/image selection and editing directly in preview, collapsible advanced panels|
|7 Hijri seasonal themes|3|real Umm al-Qura dates, tested scheduling and HQ management|
|8 tenant domains|4|feature-gated hostnames, status and DNS/SSL instructions|
|9 tenant SEO|4; basic menu metadata in1|tenant OG/schema/sitemaps without removing staging noindex|
|10 value reports|5|real events, opt-out, weekly/monthly delivery and insufficient-data states|
|11 Wallet|7|signed passes/update lifecycle with local crypto tests; activation requires issuer credentials|
|12 reservation/table payments|6|reservation flow and sandbox-gated splits/tips; demo never pays|
|13 performance evidence|1|measured first-page non-image transfer<150KB; mobile Lighthouse performance/accessibility/SEO target90+; actual numbers and conditions recorded|
|14 Node version|1|package.json engines.node >=24|

Only findings1–4,13,14 and phase1's discovery/detail requirements are implemented in this PR. Remaining findings have explicit later gates and are not reported complete.

## Shared phase-1 interfaces

- Existing `GET /api/public/menu/:slug` is extended compatibly: item fields `gallery: Array<{url,variants:Array<{url,width}>}>`, `dietary: Array<'vegan'|'vegetarian'|'gluten_free'>`, `complementary_ids: string[]`, `orders_today:number`. Categories expose `scheduled_available:boolean`; menu adds `discovery:{generated_at,timezone:'Asia/Riyadh',order_count_today}`. Existing fields/availability remain.
- `GET /api/public/menu/:slug/recommendations/:itemId` returns `{source:'orders'|'merchant'|'none',sample_size:number,items:ItemView[]}`. Use actual accepted non-cancelled order co-occurrences over30days (minimum3 supporting orders); otherwise only merchant-selected complements, otherwise empty.
- Additive migration0026 owns `items.gallery_json`, `items.dietary_json`, `items.complementary_ids_json`, and `menu_category_schedules` with branch/category scope. Gallery max6 entries; variants max3 widths320/640/960; complements max3; no arbitrary executable URL schemes.
- Existing owner item POST/PATCH accepts new bounded fields while preserving old data. `GET /api/owner/branches/:branchId/menu-schedules` returns `{schedules:[{category_id,days,start,end}]}`; `PUT /api/owner/branches/:branchId/menu-schedules/:categoryId` accepts `{schedule:{days:[0..6],start:'HH:mm',end:'HH:mm'}|null}`. Riyadh time; overnight intervals supported.
- Published recipe `layout` already supports `grid`, `list`, `text`; reuse those instead of adding a second appearance owner. Legacy other layouts remain compatible.
- Sample media helper returns `{url,variants}` for item by stable sample index/name; file prefix `/menu-art/`. Existing tenant content is never reseeded.

### Task1: truthful public discovery and owner data contract

**Files:** `src/menu-discovery.js` (new), `src/menu-extras.js`, `src/features.js`, `src/app.js`, `migrations/0026_menu_discovery.sql`, `test/menu-discovery.test.js` (new).

**Interfaces:** implements the server contracts above; consumes current sessions, branch scope and itemView; does not touch billing/push/Wallet.

- [x] RED: real D1 tests for tenant IDs, malformed URL/variants/dietary, unknown calories, same-org complements, no/real popularity, co-occurrence/manual fallback, overnight/category boundaries, unavailable checkout and idempotent receipt replay.
- [x] Confirm the new behavior fails before implementation, not because of a broken test fixture.
- [x] Implement pure clock-injected schedule/date helpers and scoped bounded SQL; preserve existing APIs/price calculation.
- [x] GREEN: targeted suites plus full `npm test` once integrated; report exact commands/evidence and changed files.

### Task2: compact customer browsing and product detail

**Files:** `public/menu.js`, `public/menu.html`, `public/menu-next.css` (new), `public/menu-discovery.js` (new), `test/menu-discovery-client.test.js` and `test/e2e/customer-menu.mjs` (new).

**Interfaces:** consumes Task1 ItemView/discovery and Task4 image variants. Existing `[data-add]`, cart storage/idempotency and option selector IDs remain compatible.

- [x] RED: browser assertions for first visible item/first rows at390×844, one-line long name, equal cards/media, explicit dietary/price/kcal filtering, zero-history sort, standalone item details, options/allergens/gallery, sold-out refresh, retained cart and no public QR.
- [x] Build thin cover and single identity row; clamp long description behind a disclosure; keep search/categories near the first products. No dashboard-sized hero on this customer page.
- [x] Implement grid/list/text recipe layouts; fixed image ratios; meaningful44px+ add/detail targets; first visible media loads promptly and later images lazily with srcset/sizes.
- [x] Details use a keyboard-safe dialog with image gallery, existing option groups/prices, full allergens and truthful complement source. With orders off, details work and no cart/add action is offered.
- [x] Search/filter/sort retain focus, announce result counts, and never treat missing values as zero. Periodic availability refresh only while visible/online; no private branch event subscription. Keep valid saved cart lines and explain newly unavailable lines.
- [x] GREEN: new browser test and old ordering/connected/tenant-studio journeys; screenshots360/390/768/1440 in both themes; no JS errors or page overflow.

### Task3: merchant control of phase-1 behavior

**Files:** `public/menu-merchandising.js` (new), `public/dashboard.js` (wiring), `public/design-studio.js` (existing menu controls), focused owner UI test.

**Interfaces:** consumes Task1 item PATCH and per-branch schedule API. Reuses canonical design draft/save/publish for grid/list/text; no legacy appearance bypass.

- [x] RED: owner can edit gallery/dietary/manual complements and branch category schedule, reload and see preserved values; foreign branch/category/item selection is rejected; layout draft stays private until publish.
- [x] Add focused accessible controls to existing owner menu/studio, including explicit gluten-free input (not inferred), gallery uploading and responsive variants through current upload transport, and manual complements fallback.
- [x] Show schedule timezone/days/start/end and clear controls; preserve names, prices, options, active flags and unrelated recipe fields.
- [x] GREEN: real UI persistence and independently opened public menu reflect published layout/current item data; existing owner/workbench tests remain green.

### Task4: original, distinct sample imagery

**Files:** `public/menu-art/*` (new), `src/sample-menu.js`, narrowly `src/demo.js` if needed, `docs/MENU-ASSETS.md`, asset contract test.

**Interfaces:** provides `/menu-art/` original art and320/640/960 WebP variants; gallery media objects match shared interface.

- [x] RED: sample items resolve to distinct appropriate existing image files/variant widths, with no repeated placeholder URL; current sample counts/options remain.
- [x] Draw original food/drink illustrations appropriate to all existing café/restaurant sample items. Render new artwork to responsive WebP; no competitor screenshots/logos or unlicensed stock. Record provenance.
- [x] Attach only to newly generated demo/sample items; do not update real merchant items or reset data. Sample themes must actually show images when applicable; text recipes intentionally hide them.
- [x] GREEN: asset tests and visual contact-sheet review at card/detail sizes; no paid services.

### Task5: real performance and release evidence

**Files:** `package.json`, `package-lock.json` if a free dev dependency is necessary, `scripts/menu-performance.mjs` (new), `.github/workflows/test.yml`, `docs/PERFORMANCE.md`, `docs/AZ-ACTIONS.md`.

**Interfaces:** runs current Worker + Task2 customer browser test; validates production-like page with synthetic data, clear throttling and cache conditions. No fake or guessed Lighthouse score.

- [x] Set Node engines >=24 and integrate the new browser test into CI; retain all existing guards/tests.
- [x] Run actual mobile Lighthouse and collect first-page non-image encoded transfer including fonts/scripts/styles/API. State exact environment and recipe; preserve staging noindex. Do not substitute embedded preview bundle size for initial page transfer.
- [x] Tune measured bottlenecks with Task2 owner; target P/A/SEO90+ and non-image initial<150KB. Record raw reports/limitations if any category fails; phase not called complete on invented numbers.
- [x] Record before/after mobile/desktop light/dark screenshots and a feature/competitor-reference/improvement table with attributed provenance.
- [x] Write AZ steps using dashboard instructions only; no paid setup, provider keys or domain changes required for phase1. Carry later-phase owner actions separately.

### Task6: independent review, integration and protected release

**Files:** integration fixes only, evidence report `docs/NEXT-LEVEL-REPORT.md` (phase1 status), refreshed Graphify graph.

- [x] Fresh reviewer checks spec/14-item phase mapping, UI at four widths, truthful data, tenant/price/cart isolation, custom recipe compatibility and performance evidence.
- [x] Address important findings with red→green evidence. Run full test/build/browser checks, then refresh graph and commit exact files.
- [ ] Create phase1 PR with seven requested skills listed, screenshots, real scores and manual actions; merge only after required CI green for the final head SHA.
- [ ] Deploy only through the current isolated review Worker build; no institution/DNS changes. Verify HTTPS menu + owner/public publication + existing pager flow on the deployed release, record SHA and rollback.
- [ ] Mark phase1 complete only with actual passing evidence; do not start phase2 in this task.

## Pre-flight rulings

- The missing14-note reference was located by Az in `claude/project-thread-gmeb0h/docs/plans/`; import only the three documents, not an older application source tree.
- The initial UI/UX search produced a marketing funnel, which does not fit a customer menu. A narrower product search matched Restaurant/Food Service; adopt compact product discovery and accessible touch targets while keeping the user's exact brand/tenant recipe, not the generic recommended palette.
- Existing badges/allergens/options, recipe ownership, demo payment safety and KDS/PWA are working foundations and are extended, not rebuilt.
- Before evidence: one fresh synthetic HTTPS room, eight screenshots, no JS errors; at390×844 first item starts528.56px, two fully visible list cards, no rendered item images in that specific default room. These are observations, not a substitute for the owner's14 notes.
