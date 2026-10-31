# ZIMARA Menu UX review

Reviewed 31 October 2026. Target: landing and connected-demo entry flow. The final
confirmation used the isolated local Worker at `http://127.0.0.1:8787`; this document
does not claim an independent HTTPS or physical-device check.

## Method

Two agents assessed the baseline independently before either received the other's
findings: **A — research_compliance** reviewed the design, journey and heuristics;
**B — integrations** checked browser behavior, computed contrast, layouts and controls.
Their evidence is in the local ignored files `output/ux-assessment-a.md` and
`output/ux-assessment-b.md`.

Assessment A's baseline Nielsen score was **26/40**. It is preserved as a baseline,
not a post-fix score or an average of two scores. No numeric rescore was performed.
Both reviews found a strong ZIMARA identity; the main friction was mobile account
access, the transition into the demo, and text/control accessibility.

The cloud-provided Impeccable skill did not expose its executable launcher/detector,
so no actual detector command ran. `axe-core` was not available in the existing tool
installation. Browser/manual checks are reported as such, not as a detector or axe pass.

## Findings → changes → confirmation

The parent implemented the changes. B then ran **one bounded confirmation batch**:
390 px mobile and 1440 px desktop × Arabic/English × light/dark, eight variants. The
check was restricted to the changed items; no further visual-polish loop was performed.

| Baseline issue | Change | Actual confirmation |
| --- | --- | --- |
| White normal-size CTA text on brand ember: **3.57:1** | Indigo ink on the original ember action surface, with a lighter hover surface; original logo colors retained | Rendered hero CTA contrast **5.14:1 default/focus**, **6.73:1 hover**, in all eight variants. These exceed the normal-text 4.5:1 threshold for the measured states. |
| Light-mode introductory descriptor: **2.00:1** | Light-mode muted text token | Rendered intro contrast **6.58:1** in light mode; dark-mode lavender remains **9.31:1** on the measured flat background. |
| Returning mobile users lost the sign-in route | Sign-in retained in the mobile header | Visible in both languages/themes at390 px, with a44 px-high link. Theme and language buttons measure **44×44 px**. The sign-in text link is30 px wide in Arabic and37 px in English; this is not a claim that every target is44 px wide. |
| Meaningful miniature menu descriptions and metric labels were too small on mobile | Larger mobile sample/caption typography | Measured mobile menu/price/metric/sample labels in the scoped selectors are **at least12 px**. A desktop decorative café sample tag remains11.2 px; no blanket claim that all page text is12 px or larger is made. |
| Decorative tablet/phone overlap could obstruct sample actions | Interactive action moved into the stage-copy area | “Try the call” is outside both decorative devices, passes Playwright's unobstructed-click check and actually changes the customer sample to ready, then resets, in every variant. |
| Demo instructions appeared after the role choices; sharing required manual URL selection | Four-step guide moved above choices; three explicit role-copy actions added | Rendered guide precedes the role grid in all variants. Display-link copy placed the exact expected link in the clipboard and announced localized success. |

No document overflow or page-error event occurred in this confirmation batch. Evidence:
`output/ux-confirm.json` and `output/playwright/ux-confirm/` (local ignored artifacts).
The first B pass separately covered360/390/1440 px, keyboard portal tabs, registration
validation, internal destinations, and reduced motion. Those broader checks were not
repeated merely to expand this confirmation pass.

## Remaining limits

The demo still requires people to coordinate independent devices or browser sessions;
placing instructions first and adding copy actions reduces that burden but does not
prove first-time usability. No participant study, screen-reader session or complete
WCAG conformance audit was performed. Contrast measurements cover the specified flat
text/action surfaces and states, not every image, gradient or component. Physical
phones, locked-device notification sound, Wallet, payment, invoicing and external POS
behavior remain outside this UX review. Passing local browser checks is not a claim
of complete commercial readiness, legal compliance or100% security.
