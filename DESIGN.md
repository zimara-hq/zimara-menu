# ZIMARA Menu design context

## Product and sources
Independent commercial menu/pager/loyalty product. Source: user brief and supplied brand profile (2026-10-30), ZIMARA assistant brand reference; PR1 operational code retained. The institutional zimara-website is read-only reference, not a deployment target.

## North star
A hospitality control room inside ZIMARA's night horizon: the landing demonstrates one scan moving between a counter display and the customer's phone. The operational app is calm, legible, task-focused. Never make disabled integrations appear live.

## Visual system
Runtime owner: public/styles.css semantic tokens for operations; public/landing.css scoped marketing tokens reference the same approved palette. Indigo #23003f; violet #8447f2; ember #f94500; lavender #bcacce; solar #fffdb4; paper #faf8fb. Marketing night background is a deliberate indigo derivative, not a change to the logo. Original supplied logo and existing approved symbol remain unaltered. Tajawal Arabic, Plus Jakarta Sans Latin; licensed OFL fonts. Desktop centered max content width 1240px; touch controls 44px minimum. Spacing in multiples of 4/8. Headings balanced, body line-height 1.7. Numerical operational data tabular.

## Surfaces and hierarchy
Landing Persuade: night hero → interactive portal → three service doors → provisional pricing/payment readiness → Ha'il origin → values → original Z on horizon → legal footer. Portal demonstrates menu/cashier/customer/loyalty roles and links to the isolated real demo. No fake customer counts or assertions of market uniqueness.
App Operate: role-aware shared header/navigation → page title/state → primary task → associated list/table → recovery. Reuse common.js forms/API/status/dialogs and dashboard owner. Public menu never includes ticket bearer tokens. Private display is revocable and branch-scoped. Profiles and cards use tenant-owned identity validated server-side.

## Motion and access
One continuous horizon/portal transition and restrained pointer tilt. No scroll-jacking. prefers-reduced-motion removes ambient, canvas and pointer motion. Both locales and light/dark modes remain available. Semantic controls, visible focus, text status and native OS selects; no authored popup appearance promise. Browser APIs request audio/push only after explicit action. No guarantee of sound when locked/DND; powered-off phones cannot receive alerts.

## Canonical owners
public/common.js: locale, theme, form/error, API and feedback. public/styles.css: application tokens and controls. public/dashboard.js: authenticated role navigation. src/context.js: permission/business validation. src/accounts.js: trial/subscription rules. src/features.js: profile/import/orders/device links. src/integrations.js: readiness and provider status. Landing markup, portal visual sample and isolated demo are separate surfaces with truthful labels.
