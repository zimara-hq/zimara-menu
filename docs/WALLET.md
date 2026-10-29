# Apple Wallet and Google Wallet: phase 2 plan

Status: **not built yet.** It cannot be tested without ZIMARA's real Apple and Google
issuer credentials, and an untested pass that never updates would be worse than none.
Phase 1 ships the web pager (page + Web Push + sound) and web loyalty cards, which
this plan extends rather than replaces.

## What Wallet adds, and what it cannot do

- A pass update makes iOS/Android show a lock-screen notification with the system
  sound, even if the customer closed the browser. This is the main gain over Web
  Push on iPhone, where Web Push needs the page added to the Home Screen first.
- It cannot ring a phone that is powered off or has no network. Nothing can.
- The sound is the system notification sound; a custom ringtone is not possible.

## Accounts the owner must create

| Need | Where | Cost |
| --- | --- | --- |
| Apple Developer Program (organisation) | developer.apple.com | 99 USD / year |
| Pass Type ID + its certificate (.p12) | Certificates, Identifiers & Profiles | included |
| APNs auth key (.p8) for pass updates | Keys | included |
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
