# Mobile foundation — 5 November 2026

## Working web behavior

Dashboard, menu, ticket, queue and loyalty pages load `/mobile.js`. The expandable “Install, connection and alerts” panel reports device capability and network connectivity separately from service availability. It never requests notification permission or creates a subscription automatically. Permission granted does not mean an order/card is subscribed; the panel directs the customer to the service page's explicit alert action. iPhone/iPad guidance includes desktop-UA iPad detection and Home Screen installation. Native browser install prompts appear only after a browser-provided event and an explicit button click.

Customer menu/card/order/queue pages use the shared customer manifest without a `start_url` or `id`, allowing the browser to use the installing document's URL. The generic application manifest has a stable identity and `/` start URL. Installation availability remains browser dependent; native iOS behavior has not been exercised on a physical device.

The service worker stores only `/offline` and `/offline.js` in its offline recovery cache. A failed same-origin GET navigation shows the bilingual recovery page at the requested URL; Retry reloads that URL. API responses, tenant HTML, account pages and action requests are never put in this cache. An HTTP 4xx/5xx response passes through as the real server response. Existing push token state is retained through cache upgrades; those tokens remain sensitive capability links managed by the existing pager worker. This is a recovery experience, not offline ordering or offline loyalty. Network connectivity does not prove the service is reachable. Sound/vibration and background delivery depend on platform settings, permission, subscription and server push configuration.

## Native implementation boundary

The existing versioned `/api/v1/*` routing and bearer-session tests in `test/app-foundation.test.js` form a server foundation for future native clients. No native binary, App Clip, Live Activity, APNs entitlement, associated-domain association or store package is built by this work. No mock install button or browser permission is evidence of those capabilities.

A real native client must use OS-protected credential storage, the existing account/session permissions, HTTPS and explicit logout; it must not embed provider credentials or persist customer capability links in analytics. Order/card/queue links should remain scoped to their existing public APIs. Web Push subscriptions are browser subscriptions, not APNs or FCM device registrations.

| Capability | Remaining concrete work |
| --- | --- |
| iOS/Android app | Select native toolchain, install SDKs, implement client screens and secure session storage, configure app identity/signing, build and test on devices, complete store submission |
| App Clip | Apple developer identity, App Clip target and entitlement, HTTPS invocation URL and associated-domain association, size/lifecycle testing and App Store configuration |
| Live Activity | ActivityKit target/models, OS permissions, activity lifecycle/expiry, server APNs token registration and scoped delivery, signing/entitlements and physical-device tests |
| Native push | APNs/FCM credentials, scoped per-device registration/revocation endpoints and delivery adapter; current browser Push API is a separate transport |

No native SDKs or new dependencies were installed. These are explicit remaining requirements, not activated integrations.

## Reproducible checks

- `node --test test/mobile-readiness.test.js`: capability states, iPadOS detection, cache boundaries, preservation of push state, API/write exclusions and server-error pass-through.
- `python test/e2e/pwa.py`: existing system Chromium + Python Playwright; real service-worker install, explicit install prompt gesture, zero automatic notification prompts, narrow viewport, iPad instructions, offline navigation/cache isolation and successful retry after reconnection. The test serves real static worker/client assets through an isolated local fixture and makes no provider/database calls.

Real-device Safari/iOS push, provider push delivery and store/native behavior still require their actual configured environments.
