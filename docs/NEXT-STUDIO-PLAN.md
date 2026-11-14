# Customer-facing design and direct editing implementation plan

> Use the existing product/brand and bounded recipe engine. Independent domains implement focused tests; root integrates, refreshes Graphify and releases through existing CI/review Worker only.

**Goal:** deliver visibly different customer-facing business sites and menus, with direct owner editing instead of another cosmetic admin update.
**Spec:** User explicitly prioritised public business/profile and menu pages; continue phase2 requirements in docs/plans/codex-next-level-prompt-2026-11-05.md while preserving phase1 operational fixes.
**World:** established ZIMARA brand remains; merchant templates own their colors/fonts. Operate mode for editor; customer public pages express each selected recipe. No invented analytics/claims, free CSS, real payments or provider activation.

- [x] Customer menu visual families: distinct composition, media and navigation from actual recipe; maintain fast first screen, keyboard, prices/cart and public QR isolation. New real-browser geometry checks and RTL/LTR screenshots.
- [x] Twenty manually authored designs within existing100 stable IDs; actual renderer screenshots in catalog, keep merchant content on ordinary apply; explicit replacement choice if changing site structure.
- [x] Direct text/image editing from preview with same-origin/source validation, bounded fields, escaping, cancel/commit; canonical draft/history/save/publish, no public edit controls.
- [x] Studio opens immediately from demo link; visible retry on transient/expired/quota failures. Ordinary connected demo preserved.
- [x] Wider editing canvas with collapsible inspector and reusable media upload; existing owner navigation and cashier permissions unchanged.
- [x] Focused RED/GREEN + existing190 tests and browser suites; one batched visual check and one confirmation; independent finish review. Refresh Graphify after source changes.
- [ ] Green final-head CI → protected review deployment → HTTPS public/owner/pager verification; report actual limits and rollback. No DNS/institutional Worker/production reset.
