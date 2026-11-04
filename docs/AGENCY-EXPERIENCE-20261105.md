# Merchant experience redesign

The previous controls were more capable than the visual result suggested. This change replaces the visual composition of the marketing hero, owner overview and design workspace while preserving their existing data and editing lifecycle.

- Marketing: large Arabic typography, photographic merchant-site scene, warm Paper/Ember direction, dark variant, restrained entrance motion and a direct studio-demo entry. The interactive pager illustration remains usable in both locales on mobile; its devices no longer cover the call button.
- Owner overview: merchant identity scene using actual saved assets, content/team/loyalty destinations, actual statistics, collapsible setup and public QR, real menu inventory. Existing navigation is grouped into work, content, operations, growth and account.
- Studio: compact app rail, full-width publish toolbar, catalogue thumbnails with photographic content (ten different frame/hero pairs shown first), desktop canvas, dedicated home/menu inspectors and a mobile preview/edit toggle that preserves input.
- Studio demo: `/demo?view=studio` creates an isolated two-hour sample website with published home content and local stock photography. Ordinary demo creation is unchanged. This does not send mail or activate any provider.

## Verification

Local target: `http://127.0.0.1:8793`, isolated migrated D1, synthetic data.

- `npm test`: 115 passing, including ordinary-versus-studio demo isolation and expiry.
- Browser suites: agency, workspace, resilience, tenant-studio, design, connected, brand-workspace passed. Covers private draft/publication, mobile preview preservation, 10 distinct menu frame geometries, cashier permissions, 18 owner destinations, independent customer/cashier/display sessions, AR/EN, both themes, 360–1536px and reduced motion.
- Worker dry run and embedded preview packaging passed; preview gzip approximately 2.21 MB including all operational assets and local fonts, not the landing's transfer size.
- Manual visual inspection: desktop/light/dark landing, owner overview, studio home and phone catalogue. Screenshots and browser result JSON are produced under `output/agency/verified/` and by CI's `connected-browser-evidence` artifact.
- The Premium static scanner still reports the same 63 heuristic findings as the preceding baseline (61 literal-button binding detections and 2 textarea detections). This is not a clean scanner report or an accessibility certification. Runtime interaction checks provide separate evidence.

## Limits and rollback

The catalogue remains 100 structural combinations across ten frames and ten hero compositions, not 100 individually designed sites. This change introduces no new database migration or external service activation, and does not modify actual merchant content. Production deployment, DNS, billing, mail settings and Wallet credentials remain outside this change. Use the existing protected review deployment and restore its previous Worker version if verification fails; no database rollback is required for this slice.
