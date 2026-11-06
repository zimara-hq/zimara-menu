# ZIMARA Menu design context

## Product and sources
Independent commercial menu/pager/loyalty product. Source: user brief and supplied brand profile (2026-10-30), ZIMARA assistant brand reference; PR1 operational code retained. The institutional zimara-website is read-only reference, not a deployment target.

## North star
A merchant's expressive digital space surrounded by a calm operational workspace. The landing leads with bold Arabic typography and an illustrative photographic merchant website. The connected visit remains available below it. Never make disabled integrations appear live.

### Connected visit and workspace navigation (2026-11-05)
The landing's five-step counter/guest scene explains linked, ready, acknowledged and collected as separate states. It is explicitly an illustration; the existing `/demo` remains the actual cross-device demonstration. Existing runtime tokens remain canonical (ownership Model B); the new scene consumes `landing.css` primitives, and the workspace finder, next-step strip and branch summary consume `styles.css` semantic tokens through `workspace.css`.

The workspace keeps the established role-specific tab shell. A searchable navigation dialog makes the same allowed destinations reachable on small screens without changing permissions. The overview prioritizes the next incomplete setup task and branch pager totals from the existing 30-day statistics API. No illustrative graph, synthetic traffic or readiness claim is inserted into the business dashboard. New motion is limited to a short entrance on the marketing illustration and is disabled by `prefers-reduced-motion`.

## Visual system
Runtime owner: public/styles.css semantic tokens for operations; public/landing.css scoped marketing tokens reference the same approved palette. Indigo #23003f; violet #8447f2; ember #f94500; lavender #bcacce; solar #fffdb4; paper #faf8fb. Marketing night background is a deliberate indigo derivative, not a change to the logo. Original supplied logo and existing approved symbol remain unaltered. Tajawal Arabic, Plus Jakarta Sans Latin; licensed OFL fonts. Desktop centered max content width 1240px; touch controls 44px minimum. Spacing in multiples of 4/8. Headings balanced, body line-height 1.7. Numerical operational data tabular.

## Surfaces and hierarchy
Landing Persuade: night hero → interactive portal → three service doors → provisional pricing/payment readiness → Ha'il origin → values → original Z on horizon → legal footer. Portal demonstrates menu/cashier/customer/loyalty roles and links to the isolated real demo. No fake customer counts or assertions of market uniqueness.
App Operate: role-aware shared header/navigation → page title/state → primary task → associated list/table → recovery. Reuse common.js forms/API/status/dialogs and dashboard owner. Public menu never includes ticket bearer tokens. Private display is revocable and branch-scoped. Profiles and cards use tenant-owned identity validated server-side.

## Motion and access
One continuous horizon/portal transition and restrained pointer tilt. No scroll-jacking. prefers-reduced-motion removes ambient, canvas and pointer motion. Both locales and light/dark modes remain available. Semantic controls, visible focus, text status and native OS selects; no authored popup appearance promise. Browser APIs request audio/push only after explicit action. No guarantee of sound when locked/DND; powered-off phones cannot receive alerts.

## Canonical owners
public/common.js: locale, theme, API and feedback. public/forms.js: guarded editor state, field validation and app-owned confirmations. public/styles.css: application tokens and controls. public/dashboard.js: authenticated role navigation. src/context.js: permission/business validation. src/accounts.js: trial/subscription rules. src/features.js: profile/import/orders/device links. src/integrations.js: readiness and provider status. Landing markup, portal visual sample and isolated demo are separate surfaces with truthful labels.

## Operational workspace extension
The identity studio remains the expressive focal point. Branch management and the cashier inbox use the same quiet surfaces and semantic status tokens, with natural document flow on mobile. Public links remain distinct from staff controls. A pending indicator describes actual work; connection state describes the last refresh, not guaranteed message delivery.

Token ownership remains runtime-first: `public/styles.css` owns the application palette/type/control tokens; `public/workspace.css` inherits them for authenticated layouts. `--violet` maps the existing approved Violet value to workspace accents through `--workspace-purple`. The shared validation and dialog owners add behavior without redefining brand colours. Native select/time popups are OS-owned by explicit policy.

## Merchant site builder (2026-11-05)
The subscriber website is a separate expressive register from the operational workspace. `tenant-studio.css` owns ten structural frames, ten hero compositions, navigation, image ratios and content density. The 100 catalogue entries are **100 structural combinations**, not 100 independently art-directed websites; IDs remain compatible. `design-structure.js` owns bounded recipe and block validation. Homepage blocks, menu-page content and typography share the existing private-draft/publish/version lifecycle. A theme switch preserves merchant content. Curated IBM Plex Sans Arabic, Readex Pro and Alexandria are self-hosted under OFL; decorative fonts are optional, not preset body defaults. The dashboard uses IBM Plex Sans Arabic. Uploaded merchant fonts remain selectable.

## Agency workspace revision (2026-11-05)
`agency-landing.css` replaces the default night/giant-symbol composition with Paper, oversized Alexandria headings, Ember actions and an illustrative photographic website. A saved theme still wins. Dark mode is an equally supported variant. The star-canvas loop is removed. Photos are local compressed WebP, credited in `docs/EDITORIAL-ASSETS.md`; they never imply actual customers or Ha'il premises.

`agency-workspace.css` consumes existing semantic tokens. The owner overview leads with a merchant identity scene from their actual profile, three task destinations, actual operational totals and existing setup/recovery controls. It never inserts stock photography into real tenant accounts. Owner navigation groups existing destinations without changing permissions.

The design workspace has an app rail, one persistent publish bar, a catalogue and a live canvas. Selecting a content editor makes the inspector narrow and the canvas dominant. On small screens, an explicit preview/edit toggle preserves the editor DOM and its values. There are no fixed-height scrolling form panels. IBM Plex Sans Arabic is the operational body, Readex Pro operational headings and Alexandria marketing headings; Latin remains Plus Jakarta Sans. Existing semantic control tokens, focus and feedback owners remain canonical.

`/demo?view=studio` is an opt-in, two-hour synthetic room with a published sample café website and illustrative local photography. The regular demo remains unchanged. No email, payment, POS or Wallet provider is activated by creating either demo.

## Selected-section workbench (2026-11-05)
The studio now separates structure, work and properties: `studio-workbench.js` owns the outline/library, `website-editor.js` the selected inspector, and `design-studio.js` the actual preview, canonical recipe lifecycle and bounded `studio-history.js`. `studio-workbench.css` consumes existing semantic colours and fonts and adds scoped canvas/surface roles. A narrow app rail keeps core workspace destinations; the explicit Workspace exit returns to the full navigation.

The default for an existing homepage is its actual canvas and selected section. Template trials use a separate explicit preview state, with publication unavailable until adoption. Phone switches preserve data; tablet starts at tablet width. Frequent actions and keyboard navigation stay immediate. Pointer feedback is restrained, transform-only and removed for reduced motion. The homepage headline identifies the menu product; the studio demo opens the editor directly after explicit room creation.

## Customer worlds and direct studio editing (2026-11-06)

This is an extension of the established ZIMARA system. Platform palette, approved logo, runtime token ownership and role permissions remain the reference. Customer websites express the merchant's bounded recipe; the surrounding editor remains a calm operational workspace. The earlier catalogue description still applies to the engine: 100 stable IDs now include 20 manually authored recipes and 80 generated combinations. The 20 are individually composed examples, not separate renderer implementations. `docs/STUDIO-DESIGNS.md` records their composition and real-renderer thumbnail provenance.

### Public composition
`public/customer-worlds.css` extends `tenant-studio.css` and the existing menu styles with recipe-scoped structure. It consumes merchant `--brand`, `--bg`, `--surface`, `--ink`, `--line`, `--on-accent` and tenant typography; it does not own platform brand tokens. Editorial menus use broad image-led entries and a larger leading item on desktop; gallery menus use image tiles with legible overlay text; ledger menus use typographic rows and rules; boutique menus use portrait plates; poster menus use square graphic rhythm. Service and market frames retain their own density. Home sections use the same selected recipe, with flatter section sequences, larger media and frame-specific featured items. Responsive changes preserve the real menu controls, prices and keyboard focus. Reduced motion removes item transitions.

`public/visitor-actions.js` owns the mobile customer quick links. It reuses a menu destination already present in the page, plus an existing validated map link or telephone link; absent destinations stay absent. It does not create ordering, booking or delivery capabilities. The preview iframe omits this floating navigation so it does not cover the editing canvas. Public profile/menu routes remain separate from pager bearer links and private display controls.

### Editor and gallery boundaries
`public/studio-canvas.css` consumes existing workspace/studio surface, rule and typography tokens. Its outline, live canvas and inspector are layout roles, not a replacement identity. Desktop controls collapse the inspector or both side panels; mobile switches preserve the editor and its values. The catalogue uses actual rendered example screenshots for the 20 authored designs. `/designs` is a public browsing surface; an explicit trial action creates or reuses only its own isolated synthetic room, applies the selected example there and opens its published customer website. Ordinary gallery browsing creates no room. `/demo?view=studio` directly bootstraps the isolated studio editor; the connected demo remains a separate journey.

`public/studio-inline.js` owns direct text/image selection in the actual same-origin preview iframe. `studio-inline.css` is loaded only in that embedded preview; public customers receive no editable fields. Plain-text fields, bounded recipe targets and image choices feed the canonical draft/history/save/publish owners in `design-studio.js`, `studio-history.js`, `website-editor.js` and the existing upload controls. Both message origin and iframe source, as well as the preview URL, are validated. Save/publish flush active text edits before continuing. Previewing is not adoption or publication. Ordinary design application preserves merchant content; replacing example content requires the explicit replacement action.

### Shared SVG and role ownership
`public/icons.js` owns the bounded shared outline SVG vocabulary; `public/icons.css` owns its minimal alignment behavior. Icons inherit `currentColor`, use a consistent stroke and remain decorative beside visible labels or accessible control names. System-authored interface text and labels use no emoji; use authored SVG for pictorial affordances. Existing local inline SVG remains valid where a surface already owns it. Merchant-entered text is not a platform icon source. This rule does not alter tenant colours or the supplied logo.

`public/common.js` continues to own locale/theme/API feedback, `public/forms.js` guarded forms and confirmations, and `public/dashboard.js` authenticated navigation. The new gallery, direct editing and customer navigation do not grant cashier/guest roles owner editing rights. Providers and operational readiness remain owned by existing server policies; a visual preview never implies activated payments, Wallet, email or POS.
