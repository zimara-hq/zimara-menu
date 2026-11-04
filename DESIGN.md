# ZIMARA Menu design context

## Product and sources
Independent commercial menu/pager/loyalty product. Source: user brief and supplied brand profile (2026-10-30), ZIMARA assistant brand reference; PR1 operational code retained. The institutional zimara-website is read-only reference, not a deployment target.

## North star
A hospitality control room inside ZIMARA's night horizon: the landing demonstrates one scan moving between a counter display and the customer's phone. The operational app is calm, legible, task-focused. Never make disabled integrations appear live.

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
