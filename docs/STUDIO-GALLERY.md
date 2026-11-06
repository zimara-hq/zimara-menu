# Public design gallery

`/designs` is an Arabic-first public collection with an English switch. It lists the 20 curated designs returned by `GET /api/public/designs`, using their actual website screenshots and a business-sector filter. It uses the pinned ZIMARA palette, local Tajawal/Plus Jakarta Sans fonts, inline SVG icons, dark mode, visible keyboard focus, and reduced-motion support. Browsing does not create a demo.

“Try website” opens the selected design as a customer-facing website:

1. Read only this gallery's `zm_design_gallery_room` value from session storage. If a token exists, validate it through `GET /api/demo/:token` and require the synthetic-room scope.
2. Otherwise create an isolated room through `POST /api/demo` with `{mode:"studio"}` and retain its token immediately.
3. Establish that room's owner session, then fetch the current owner design revision.
4. Apply the selected preset with `{revision,replace_content:true}` and publish using the returned revision.
5. Navigate to `/p/:org_slug?lang=…`, the actual published customer profile. There is no pager QR in this journey.

The gallery never reads a general demo link or an existing owner session as authorization to mutate a tenant. Every design write follows an owner session established using its synthetic-room bearer. Demo billing protections remain server-side; the gallery calls no commercial billing or paid generation APIs.

Busy controls prevent duplicate concurrent attempts. Capacity, expiry, and connection errors show a localized status and explicit retry button. A 410 clears the expired room but does not automatically create another. Other failures retain an already-created room for retry. The room bearer stays in session storage rather than public profile URLs. Session-storage restrictions fall back to in-memory retention for the current page.

## Verification

The public gallery was missing before implementation. `output/playwright/next-studio/gallery/red.log` records the expected failure waiting for its first design tile.

Run against a migrated local server:

```sh
node test/e2e/design-gallery.mjs http://127.0.0.1:8793 output/playwright/next-studio/gallery
```

`green.log` records seven passing checks: 20 distinct real previews without room creation, working sector filtering, applying and publishing the selected preset into the actual customer site, reusing the gallery room after returning, Arabic RTL at 360px with dark/reduced-motion preferences, capacity failure with manual retry, and expired-room validation with no automatic replacement. The saved desktop, mobile-dark, and customer-preview PNGs capture the real pages. The test checks published homepage data against the owner's published design and verifies the customer page has no pager QR. Error injection occurs only at the local API response boundary.
