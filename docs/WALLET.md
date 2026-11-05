# Apple Wallet and Google Wallet: phase 2 plan

Status: **issuance and delivery are not built yet.** It cannot be tested without ZIMARA's real Apple and Google
issuer credentials, and an untested pass that never updates would be worse than none.
Phase 1 ships the web pager (page + Web Push + sound) and web loyalty cards, which
this plan extends rather than replaces.

## What Wallet adds, and what it cannot do

- A correctly signed pass plus its implemented update service can provide a
  lock-screen update when the device and platform permit it. Visibility, delivery
  and sound depend on platform rules, notification settings, connectivity and
  focus/silent modes. No lock-screen sound or delivery guarantee is made.
- The pass-signing and update service are not built in this repository yet.
  Web Push on iPhone normally requires a supported iOS version and installation
  to the Home Screen; certificate ownership alone does not remove that limit.
- It cannot ring a phone that is powered off or has no network. Nothing can.
- The sound is the system notification sound; a custom ringtone is not possible.

## Accounts the owner must create

| Need | Where | Cost |
| --- | --- | --- |
| Apple Developer Program (organisation) | developer.apple.com | 99 USD / year |
| Pass Type ID + its certificate (.p12) | Certificates, Identifiers & Profiles | included |
| APNs credentials appropriate to Wallet pass updates | Verify current Apple PassKit/APNs requirements | included |
| Google Wallet API issuer account | pay.google.com/business/console | free |
| Google Cloud service account + JSON key, with Wallet API enabled | console.cloud.google.com | free |

Secrets go to the Worker with `wrangler secret put`, never into the repository.

## Pager pass (one per ticket)

1. Ticket page shows "Add to Apple Wallet" / "Add to Google Wallet" when configured.
2. Apple: `GET /api/t/:token/pass.pkpass` builds a `generic` pass (number, branch,
   status) signed with the Pass Type certificate (PKCS#7 detached, `node-forge` under
   `nodejs_compat`). `webServiceURL` + `authenticationToken` let the device register.
3. Apple web service endpoints (`/wallet/v1/devices/...`, `/wallet/v1/passes/...`)
   store device push tokens per ticket in a new `wallet_registrations` table.
4. On "ready" (and each repeat), send an APNs push to those tokens. iOS fetches the
   updated pass; the status field uses a `changeMessage` ("طلبك رقم %@ جاهز") so the
   lock screen shows the alert. APNs needs HTTP/2: verify from Workers first; if
   Workers cannot reach it, relay through a small HTTP/2-capable endpoint.
5. Google: a Generic pass object per ticket via a signed "Save to Google Wallet" JWT
   (RS256, WebCrypto). On "ready", PATCH the object and `addMessage` with
   `messageType: TEXT_AND_NOTIFY` using a service-account OAuth token.
6. Expire/void the pass on collect or cancel.

## Loyalty pass (one per card)

Same mechanism, `storeCard` (Apple) / Loyalty class+object (Google). Each ledger
insert (stamp/redeem) triggers a pass update so the stamp count stays in sync.

## Acceptance before claiming it works

On a real iPhone and a real Android phone, with the phone locked: add the pass,
press Ready on the cashier screen, and confirm the lock-screen alert and sound.
Repeat for a stamp on the loyalty pass. Record device, OS version and result.

## Credential-free foundation available now

`src/wallet.js` builds a Google Generic pager object with a stable issuer-scoped ID,
public ticket URL barcode, preparing/ready status and an inactive state for collected
or cancelled tickets. It signs a five-minute, origin-bound Save JWT with a supplied,
non-extractable RS256 key. Unit tests generate a throwaway key locally and verify
the signature, lifecycle state, origin validation and omission of private tenant data.
No provider call is made and no pass is issued by these helpers. No Wallet route or
button is enabled. The readiness API continues to report both Wallet providers as
unimplemented because the complete signing/update lifecycle is still absent.

Before exposing a Save URL, add token-scoped issuance authorization, verify active
org/branch/ticket state, rate-limit issuance, and load the issuer configuration and
private key only on the server. Never expose service-account JSON or private keys.
Do not cache a Save JWT in public HTML, analytics, logs or shared responses.
The Google class must exist under the approved issuer; a locally verified JWT is
not evidence that Google will accept the object.

## Implementation and acceptance gates

| Gate | Evidence required before enabling customer buttons |
| --- | --- |
| Apple package signing | Real Pass Type ID and certificate chain; signed `.pkpass` installs on a physical iPhone |
| Apple update protocol | Authenticated registration/deletion/pass-fetch routes; per-pass authorization tokens, monotonic update tags and conditional fetch tests |
| Apple delivery | APNs HTTP/2 transport tested with the issued pass; invalid device tokens removed without exposing provider details |
| Google issuance | Approved issuer/class, server-side service-account key, Save JWT accepted by an Android device |
| Google updates | OAuth access token acquisition, idempotent object update and notification lifecycle tested with a real object |
| Lifecycle/privacy | Collected/cancelled/expired tickets deactivate passes; revoked cards stop updates; device registrations have documented retention and deletion |
| Observability | Separate persisted ticket state, provider acceptance and device observation; never call a provider HTTP success proof of delivery |

Record each device check with date, app build, device model, OS/browser, installed
PWA/pass state, notification permission, Focus/silent settings, connectivity,
provider response category and observed alert. Cover preparing → ready, repeat,
collect/cancel, revoked access, duplicate events, expired/revoked credentials and
an offline-to-online recovery. Do not record bearer ticket URLs, JWTs, signing keys
or APNs device tokens in acceptance reports. Sound remains subject to device rules.
