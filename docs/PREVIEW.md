# Isolated HTTPS preview packaging

This repository is the separate ZIMARA Menu product. Preview packaging must not touch
the `zimara-website` Worker, `zimara-platform`, `zimara-menu-trial`, DNS, production
secrets, owner account or MFA state.

## Build the deployable module

Install the repository dependencies first (`npm ci` when a lockfile is present), then:

```bash
node scripts/build-preview.mjs
```

The script resolves the installed `esbuild` package directly or through Wrangler's
package dependencies. It does not install packages or access Cloudflare.

Outputs are generated on every invocation from the **current working tree**:

- `.wrangler/preview-build/index.js`: one ESM Worker module containing the existing
  application plus embedded static assets.
- `.wrangler/preview-build/manifest.json`: SHA-256, raw/gzip bytes, asset byte sizes and
  hashes, base commit, build time and bundle source paths.

The files are ephemeral and ignored by the existing `.wrangler/` rule. They must not be
committed. The manifest's HEAD SHA identifies the base commit; it does not imply a clean
working tree. Rebuild after any source/public edit and verify the new module hash before
uploading. A previous SHA is not evidence for a later build.

Only `public/` assets and the application's normal module dependencies are bundled.
No `.dev.vars`, environment files, Wrangler production configuration, provider secrets
or database contents are read. Secret references in application source remain runtime
binding references; values are never compiled into this module.

## Embedded static-assets behavior

The wrapper imports `src/worker.js`, preserves its `scheduled` handler and existing API
routing, and supplies a fallback `env.ASSETS.fetch` implementation only when the runtime
has no real `ASSETS` binding. A real asset binding takes precedence.

- `/` serves `public/index.html`.
- Clean routes such as `/login`, `/register`, `/demo` and `/legal` resolve the matching
  `.html` file when that file exists. Directory `index.html` files also resolve.
- Existing application page rewrites (`/m/:branch`, `/t/:token`, `/c/:token`, `/j/:org`,
  `/display/:token`) pass through the application's own `PAGES` map, then resolve the
  appropriate embedded shell. This packaging does not introduce public pager QR data.
- API requests still reach the application; an unknown `/api/...` remains a JSON 404.
- Missing assets return the branded `404.html` with HTTP 404, not a successful SPA shell.
- Text MIME types include UTF-8; image/font/audio/video bytes are embedded as base64
  and decoded without Node.js APIs at runtime. License text is retained.
- GET and HEAD, ETag/If-None-Match, and a bounded browser cache policy are supported.
  HTML, manifests and service-worker requests use no-cache. `_headers` rules are
  applied, including `Service-Worker-Allowed: /`; the application continues adding
  its CSP and other security headers.
- Dotfiles, symbolic links, source maps, dependency/artifact directories and metadata
  files are not served. `_headers` is parsed as configuration, not exposed. `_redirects`
  is excluded rather than interpreted; if redirects become necessary, implement them
  explicitly in application routing and test them.
- Unsupported extensions fail the build. Limits are 5 MiB per asset and 20 MiB raw
  assets. These are packaging safeguards, not a promise about a Cloudflare plan's
  current Worker-size allowance. Check the emitted compressed size against the
  actual account's current limit before upload.

No source map is generated. The only compile-time define is the non-secret production
mode. MIME handling does not bypass the application's CSP or permit inline scripts.

## Upload requirements (performed separately)

This script **does not deploy**, create infrastructure or provision secrets.

A separately authorized deployment tool can upload `index.js` as the Worker's ESM
`main_module`, with MIME `application/javascript+module`. Static assets are already
embedded, so no asset-upload session, `ASSETS` binding or manifest upload is required.

Before uploading:

1. Select a new, explicitly isolated preview Worker name and a separate preview D1.
2. Apply the repository migrations **only** to that isolated D1. Never seed/reset any
   production database or copy customer data into a preview.
3. Bind that D1 as `DB`. Provision a fresh preview `AUTH_SECRET` privately through the
   deployment tool's secret mechanism. Never place it in build arguments or files.
4. Set environment flags deliberately for preview. Do not copy live payment, invoice,
   POS, messaging or Wallet credentials. Unconfigured integrations remain disabled.
5. If Web Push is tested, use separate preview VAPID credentials and synthetic devices;
   configured keys alone are not proof of notification delivery.
6. Preserve or configure the app's expected scheduled trigger only on the preview
   Worker. The handler is included; the upload does not itself create a Cron trigger.
7. Record the exact uploaded module SHA-256, preview URL, Worker name and isolated
   database ID in the deployment evidence. Do not change a production custom domain.

The module is self-contained code, **not** a self-contained database. A missing DB
binding still prevents account/menu/pager API flows. A successful static page is not
proof that migrations, credentials, scheduled events or an end-to-end journey work.

## Verification after upload

Use synthetic accounts and independent sessions for owner, cashier, display and
customer. Verify actual HTTPS behavior including:

- landing, registration/login and all clean routes; correct scripts, CSS and logos;
- security headers, service-worker scope and no JavaScript console failures;
- live cashier → private display QR → customer link → QR disappears → ready → seen →
  collected, preserving seen/collected as separate states;
- refresh persistence, tenant isolation, duplicate actions and offline reconnection;
- public profile/menu never exposes ticket QR or display-device credentials;
- invoice/Wallet/payment/POS status remains honest when providers are not configured;
- Arabic/English, mobile/desktop, keyboard focus and reduced motion.

Retain real browser evidence and request results with the module SHA. Local import and
static checks prove packaging behavior only; they do not prove deployment or device
notification delivery.
