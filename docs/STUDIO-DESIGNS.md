# Authored studio designs

Twenty individually composed directions replace existing stable catalogue IDs. The catalogue still contains 100 entries; the other 80 remain the existing generated combinations. These 20 are authored bounded recipes, not 20 independent renderer implementations. Each has a different home block sequence plus an explicit frame, hero, navigation, menu layout, typography and media treatment.

The tenant can own its visual identity. ZIMARA platform identity is unchanged. Text and photography in these examples are illustrative; they do not claim actual premises, sourcing, business results or customers. Images reuse credited local editorial assets; see [EDITORIAL-ASSETS.md](EDITORIAL-ASSETS.md). Service directions use typographic heroes rather than unrelated photographs.

| Stable ID | Direction | Frame / hero | Menu / navigation | Home sequence |
| --- | --- | --- | --- | --- |
| latte-classic | Paper courtyard | atelier / split | list / rail | hero → text → featured → menu → branches |
| mocha-luxe | After hours | boutique / portrait | elegant / pills | hero → menu → image → text → hours → social |
| matcha-grid | Matcha garden | market / inset | grid / pills | hero → featured → gallery → loyalty → menu → hours |
| caramel-photo | Warm mornings | split / panorama | cards / rail | hero → menu → featured → text → loyalty → branches |
| roast-classic | Roaster journal | ledger / minimal | text / index | hero → text → menu → faq → social |
| origin-luxe | Coffee atlas | editorial / stacked | magazine / index | hero → gallery → text → featured → menu → social |
| ember-photo | Ember table | poster / wordmark | tiles / rail | hero → menu → text → featured → branches → hours |
| olive-classic | The olive table | atelier / banner | list / rail | text → hero → featured → menu → hours → social |
| navy-luxe | Ink and gold | boutique / centred | elegant / index | hero → text → menu → branches → faq → cta |
| saffron-grid | Saffron market | market / banner | grid / pills | hero → featured → menu → faq → branches → social |
| smash-classic | Smash poster | poster / wordmark | cards / pills | hero → featured → cta → menu → hours |
| charcoal-grid | Charcoal counter | sidebar / minimal | compact / sidebar | hero → menu → featured → branches → social |
| heritage-classic | Hospitality courtyard | atelier / centred | list / rail | hero → menu → text → branches → hours → faq |
| majlis-luxe | Diwan | ledger / wordmark | text / index | hero → text → menu → hours → branches → cta |
| croissant-photo | Morning bakery | editorial / split | magazine / rail | hero → image → featured → menu → text → hours |
| rose-grid | Rose window | gallery / portrait | tiles / pills | hero → gallery → menu → featured → cta → social |
| pistachio-luxe | Pistachio box | boutique / inset | elegant / index | hero → featured → text → menu → faq → social |
| citrus-photo | Citrus sunshine | split / wordmark | grid / pills | hero → menu → featured → loyalty → branches → social |
| care-classic | Space for care | service / minimal | compact / sidebar | hero → menu → faq → hours → branches → social |
| velvet-luxe | Quiet salon | gallery / centred | elegant / index | hero → text → menu → faq → branches → hours → social |

## Integration

The owner catalogue response includes `curated: true` and `preview_url` on these 20 entries; the remaining 80 return false and null. Render the URL as a lazy image with the translated design name as its accessible label. Filter on `preset.curated` to present the authored collection; do not infer curation from array index, sector or ID. Existing stable IDs, the 100-entry count and all allowed recipe validation boundaries remain intact.

The ordinary apply endpoint deliberately retains the merchant's existing enabled homepage and all menu content/settings. It does not silently replace merchant text, blocks, announcements or services. An explicit adoption flow may use existing `replace_content: true` after explaining that it replaces home/menu template content; previewing is private and does not save or publish. New tenants without an existing draft receive the selected illustrative example, which they can edit before publishing. Applying a design never reseeds business products, branches or tenant profile identity.

## Preview evidence

Run `node output/playwright/next-studio/curated/capture.mjs` against local port 8793 after starting the app. The script creates one isolated synthetic studio demo room, loads the production public home and menu in a same-origin preview iframe, then posts each validated recipe using the real `zm-design` preview protocol. It captures 40 PNGs at 1200×900 and converts the 20 home captures into 640×480 WebP catalogue thumbnails. No fake browser layout or generic mockup is used. The example business and menu data are synthetic.

Results, frame/menu geometry, missing image checks, overflow checks and browser errors are recorded in `output/playwright/next-studio/curated/results.json`. Thumbnails carry an origin comment identifying their source renderer and recipe. They show an example site's first viewport; the live canvas remains the authoritative preview of the merchant's own content.

## Validation

The catalogue boundary test was written first and failed because curated metadata was absent (0 versus 20). The implementation then passed catalogue validation, all 20 unique block sequences and merchant-content preservation tests, alongside existing design and tenant-studio tests. The public renderer continues to enforce bounded choices; recipes contain no arbitrary CSS, HTML or scripts. All 20 body text colours meet 4.5:1 contrast on both recipe background and surface.
