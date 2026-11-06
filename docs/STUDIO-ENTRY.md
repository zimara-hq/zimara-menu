# Studio demo entry

`/demo?view=studio` creates an isolated synthetic room with `{mode:"studio"}`, opens its owner session and replaces the URL with `/app?lang=<selected language>#design`. A `#room=<bearer>` fragment resumes that room directly. Explicit `role=cashier` and `role=display` retain their existing destinations and permissions.

The bootstrap shows a brief accessible progress status, with no marketing or room creation gate. On a capacity limit, expired or revoked room, or network error it shows a manual Retry button and an ordinary connected demo link. There are no automatic retry loops. Network/session failures retain the room fragment; a 410 clears the expired bearer and the next explicit retry creates a replacement. A single in-flight guard prevents duplicate starts. Editor reload uses the existing session without bootstrapping again.

The bearer stays in the fragment and same-origin API paths; successful navigation removes it from the current URL. Studio entry does not put it into external resource URLs. `/demo` keeps the connected-room screen and manual creation behavior.

Run against a migrated local development worker:

```sh
source /workspace/toolkit/env.sh
node test/e2e/studio-entry.mjs http://127.0.0.1:8793
```

Evidence is under `output/playwright/next-studio/entry/`: RED log records the previous gated entry failing to reach the editor; GREEN log records automatic entry, reload, resume, connected-room behavior, explicit roles, and manual error recovery. Error tests intercept only local demo API failures; happy paths use real synthetic rooms and sessions. No providers or external messages are involved.
