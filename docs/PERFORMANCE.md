# Customer menu performance — phase 1

Actual measurements use the isolated local synthetic Worker, not the embedded preview bundle size. The HTTPS review deployment retains `X-Robots-Tag: noindex, nofollow`. An indexable local result does not demonstrate that the review URL is indexable or that its Lighthouse SEO score reaches 90.

## Reproduction and accounting

Use Node 24+, install the repository's free development dependencies, migrate an isolated local D1 database and start the existing Worker in development mode. Create a synthetic demo room and pass its public menu URL:

```sh
npm run test:menu-performance -- http://127.0.0.1:8793/m/SYNTHETIC-BRANCH output/playwright/next-menu/performance-final
```

`CHROMIUM_PATH` optionally selects Chrome. The script uses installed system Chromium when present, otherwise Playwright Chromium. `LIGHTHOUSE_MODULE` optionally points to an existing Lighthouse module; the ordinary installation resolves the pinned development dependency. This workspace used `/dev/shm/menu-lighthouse/node_modules/lighthouse/core/index.js` and `TMPDIR=/dev/shm` because the workspace disk was nearly full. No shared `node_modules` installation was replaced.

The harness makes two independent cold navigations. The transfer navigation uses a fresh browser context, HTTP cache disabled, service workers blocked, a 390×844 viewport at device scale 1, no scrolling or interactions, waits for network idle, the loaded fonts and another 1.5 seconds. It sums Chrome CDP `Network.loadingFinished.encodedDataLength` for every non-image resource, including the document, fonts, JavaScript, CSS, API and manifest requests. HTTP overhead is included, so this is conservative relative to encoded body bytes. Image MIME types, image resource types and image file extensions are excluded. This is initial page transfer, not source size or preview bundle size. Each response and cache flag is retained in `transfer.json`. Later scrolling, user interactions and periodic refresh are outside this stated initial window.

The Lighthouse navigation uses Lighthouse **13.0.3**, Chrome **154.0.0.0**, Node **24.19.0**, Linux **6.18.57 x64**. Standard mobile simulation is retained: 412×823 CSS pixels, device scale 1.75, 4× CPU slowdown, 150ms RTT, 1638.4Kbit/s simulated throughput; request latency 562.5ms, download 1474.56Kbit/s, upload 675Kbit/s. Storage resets are enabled. All default performance, accessibility and SEO audits run; `skipAudits` and blocked URL patterns are null. Raw JSON records the full configuration, environment, audit details and warnings. Local network conditions and available CPU are not a real Saudi handset or production edge.

The optional `--gzip-local` mode is restricted to localhost and explicitly labels its output as a local compression proxy. It preserves robots headers. It is unnecessary when Wrangler already returns compressed text, as observed here; the recorded direct measurement does not use it.

## Actual measurements

| Measurement | Recipe/environment | Performance | Accessibility | SEO | Non-image encoded transfer |
| --- | --- | ---: | ---: | ---: | ---: |
| Before, 2026-11-05 18:21:54 UTC | Synthetic `demo-ep87e9aueta-hail`; Arabic/light; no published design, default list without dish images; direct indexable local Worker | 83 | 96 | 90 | 317,918 bytes — fails <150,000 |
| Intermediate, 2026-11-05 18:26:20 UTC | New synthetic `demo-thky1sooa1m-hail`; published grid, 16 original item images, Arabic/light; original font files still loaded | 89 | 100 | 91 | 512,928 bytes — fails <150,000 |
| Intermediate reference, 2026-11-05 18:29:24 UTC | Same published image-grid fixture; genuine WOFF2 menu font aliases; direct indexable local Worker | **95** | **100** | **91** | **130,778 bytes — passes <150,000** |

Final current source: **94 performance / 100 accessibility / 91 SEO**, **132,221 encoded non-image bytes**, direct local Worker at **2026-11-05 23:36:13 UTC**. FCP1.3s, LCP2.4s, TBT220ms; all performance gates passed. Raw evidence: `output/playwright/next-menu/performance-stable/{summary.json,lighthouse.json,lighthouse.html,transfer.json}`. This supersedes the earlier95 as the current source measurement.

Baseline raw evidence: `output/playwright/next-menu/performance-baseline/{lighthouse.json,lighthouse.html,transfer.json,summary.json}`. First contentful paint 2.0s, largest contentful paint 3.5s, total blocking time 290ms. Three Arabic Tajawal weights plus Jakarta Latin cost approximately 232KB; this is the principal initial transfer bottleneck. The accessibility audit found the powered-by footer contrast at 3.69:1. SEO reported a missing meta description. These are observed findings, not estimated scores.

Final raw evidence: `output/playwright/next-menu/performance-final/{lighthouse.json,lighthouse.html,transfer.json,summary.json,fixture-recipe.json}`. The harness exited 0 with no runtime warnings or page errors. FCP 1.3s, LCP 2.4s, TBT 180ms. Lighthouse runtime benchmark index was 1779.5 (baseline 636), illustrating the changing shared-host CPU conditions; no repeated-run median or handset claim is made. The intermediate image-grid run remains under `performance-grid/` and is reported because it failed the transfer/performance gates. An additional 18:27:52 font-tuning run scored 95/100/91 with 130,814 bytes and remains under `performance-final-pre-regular/`; the final run uses a regular 400 face with browser-synthesized bold for correct body typography.

The final recipe is the canonical published `grid` recipe: `font_ar:tajawal`, `font_en:jakarta`, primary `#23003f`, accent `#8447f2`, background `#f7f5fa`, surface white, images/calories/descriptions/allergens enabled, square media, balanced density, Arabic/light. The full recipe is saved beside the reports. Sixteen dish image elements rendered. Initial non-image transfer includes two font requests: MenuJakarta 22,854 bytes and MenuTajawal 20,562 bytes including headers. The before default and final image-grid recipes differ, so the before/after row is evidence of the specific measured pages, not a controlled same-recipe speed ratio.

Remaining Lighthouse findings are retained: missing meta description (SEO still 91), render blocking CSS, unminified JavaScript, LCP request discovery and back/forward cache. All default audits ran. HTTPS preview has not been audited in this local result; its intentional noindex protection remains. A custom merchant font or a larger merchant photo can materially change transfer and LCP; a synthetic recipe result is not a guarantee for every tenant.

## Visual and competitor evidence

Before screenshots at 360/390/768/1440px in light/dark are under `output/playwright/next-menu/before/`; the final customer browser journey records the matching after set. Screenshots are visual evidence and do not substitute for transfer or Lighthouse measurements.

| Feature | Attributed reference | Phase-1 improvement to verify |
| --- | --- | --- |
| Compact first screen and direct add | Owner review, 5 Nov 2026, section 3 findings 1–3 compares بيجري and منيو باركود | One-line identity, thin cover, visible products and direct card action |
| Distinct sample item media | Owner review finding 4 | Original item-specific artwork and responsive image variants |
| Filters, details and complements | Owner's next-level prompt, phase 1, and competitor research inputs | Explicit dietary data, unknown calories preserved, real order counts/manual fallback |
| Measured delivery cost | Owner review finding 13 | Actual cold transfer and mobile Lighthouse reports with conditions |

References are attributed owner observations and requirements, not an independently verified current competitor feature audit or a claim of universal superiority.

## Final-head diagnostic follow-up

After price-consent and title-fitting changes, fresh measurements were retained rather than reusing the earlier95. The first run overlapped other browser checks (77 performance); the isolated follow-up scored86 with132KB transfer. Its trace attributed blocking work to synchronous canvas font measurement in the title fitter. Replacing that with native overflow measurement across animation frames reduced blocking, but a subsequent run exposed a0.926 layout shift from the old visible loading placeholder being replaced. The initial menu shell now reserves the first viewport, with an accessible visually hidden loading status and explicit aria-busy lifecycle. These diagnostic runs remain under `performance-head`, `performance-head-serial` and `performance-optimized`; they are not final acceptance scores.

## Font build provenance

The existing source files named `.woff2` contained uncompressed TrueType data. New menu-only assets use actual WOFF2 encoding with the full original glyph set, not a subset:

| Output | Existing source | Encoded bytes | Preserved glyphs / mapped codepoints |
| --- | --- | ---: | ---: |
| `public/fonts/menu-tajawal.woff2` | `tajawal-arabic-0.woff2` | 19,884 | 448 / 446 |
| `public/fonts/menu-jakarta.woff2` | `jakarta-latin-0.woff2` | 22,176 | 781 / 721 |

FontTools 4.61.1 `TTFont`, `font.flavor='woff2'`, `font.save(output)` with Brotli 1.2.1 performed encoding. Reopening each output asserted equality of `getGlyphOrder()` and `getBestCmap()` with its source. The existing `public/fonts/Tajawal-OFL.txt` and `Plus-Jakarta-Sans-OFL.txt` licenses remain alongside the assets. Original files were not changed. The client declares menu-only aliases and synthesizes weights from the selected static faces, and translates only the matching default family names; merchant custom fonts and other curated families remain their own recipe choices.
