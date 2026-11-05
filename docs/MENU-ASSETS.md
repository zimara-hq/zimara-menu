# Original sample menu artwork

Created 2026-11-05 for synthetic starter menus and new demonstration rooms. These are illustrations, not photographs of an operating merchant's dishes. Every café item (16) and restaurant item (11) has its own appropriate composition; nothing changes existing tenant rows.

All 27 editable SVG drawings in `public/menu-art/` are original geometric artwork authored for this repository. No stock food photographs, competitor screenshots, third-party logos, external image models, uploaded images, paid services, provider keys or network downloads were used. The project may use and modify these drawings. Existing editorial home/banner photography and its separate provenance are unaffected.

Each illustration uses warm paper, ceramic, food-specific colors, restrained gradients, and a 960×640 composition. The artwork has no embedded fonts or text beyond accessible SVG titles/descriptions, so merchant typography and colors retain recipe ownership. The subjects remain centered at small card sizes; closely related coffees intentionally share ceramic styling but differ in vessel size, coffee tone or foam treatment. Zaatar/cheese and butter croissants, beef/chicken burgers, and hummus/moutabal each have their own food-specific details.

SVG sources were rasterized as new images through system Chromium using Playwright and browser Canvas `toDataURL('image/webp', .79)`. Responsive widths are 320, 640 and 960 (2:3 height ratio rounded to whole pixels). There are 108 assets, totaling **565,058 bytes** of source SVG and WebP. No image editing of existing files was performed. Re-render by loading any source SVG into a browser `Image`, drawing to a Canvas at each target width with height `Math.round(width * 2 / 3)`, and exporting WebP at quality .79.

`sampleItemMedia(sector, indexOrName)` in `src/sample-menu.js` resolves the stable sample index or Arabic/English sample name to `{url, variants:[{url,width}]}`. Its default is the 640px WebP; all paths begin `/menu-art/`. `sampleMenuStatements` attaches the single-image gallery and legacy `image_url` during new sample INSERTs. Migration 0026 supplies `gallery_json`. The studio demo uses this same mapping rather than replacing sample item media with repeated coffee/pastry stock. No UPDATE/reseed/storage reset is used to attach the new artwork. Text recipes may deliberately hide item media.

| Café assets | Restaurant assets |
| --- | --- |
| espresso, americano, latte, cappuccino, flat-white, saudi-coffee | hummus, moutabal, cheese-sambousa |
| iced-latte, cold-brew, spanish-latte, lemon-mint | chicken-kabsa, lamb-mandi, mixed-grill |
| butter-croissant, zaatar-cheese-croissant, chocolate-cookie | classic-burger, crispy-chicken-burger |
| san-sebastian-cheesecake, tiramisu, date-cake | fresh-orange-juice, laban, water |

Visual evidence: `output/playwright/next-menu/art-contact-sheet.png` contains all27 source compositions. The author reviewed this through the image viewer at card sizes: distinct subjects, no clipped primary food/drink, readable forms and consistent light backgrounds. Detail evidence uses the actual 640px WebP exports in `art-detail-sheet.png`. Contract tests verify complete mapping, distinct URLs, original source titles, actual WebP files, the asset budget, both fresh demo paths, and unchanged sample names/prices/calories. Existing tenant content is never modified by this mapping.

Visual review revision: espresso now uses a small demitasse, golden crema and separate coffee beans; Americano uses a tall mug and a separate water carafe. Regenerated both original SVGs and six WebP variants through browser Canvas, retained dimensions/style, and reviewed `art-coffee-revision.png`. Asset contract tests pass2/2 after revision.
