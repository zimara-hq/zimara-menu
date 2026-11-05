# Phase 1 backend fix recheck — approved

Rechecked 2026-11-05 against `review-server-fixed.diff`, current `src/app.js`, current `src/menu-discovery.js` (including the later recommendation fix), `test/menu-discovery.test.js`, appended backend evidence, and both pairs of RED/GREEN logs. The initial findings below are retained as review history and are all closed.

**Current spec verdict: PASS for the reviewed backend scope.** All three reported defects are resolved; no outstanding spec finding remains in this review.

**Current code-quality verdict: PASS for the reviewed backend scope.** The fixes address the causes with focused regression coverage and do not introduce an identified regression. Whole-branch integration, client/performance, and root's running full suite remain separate gates.

| Initial finding | Resolution verified in current source | Status |
| --- | --- | --- |
| P2 deleted complement blocks unrelated PATCH | `src/app.js:447` executes deletion and JSON-reference pruning in one D1 batch; pruning is restricted to the owner's org. Remaining IDs survive, and explicit invalid IDs still fail the existing write validation. | Closed |
| P2 historical limit hides eligible recommendations | `src/menu-discovery.js:66` derives eligible IDs from the currently available public menu; line 69 binds the ID set as JSON and filters in SQL before aggregate/ranking and `LIMIT 3`. Tenant/branch/date/cancellation/support restrictions and deterministic ranking remain. | Closed |
| P3 array times cause HTTP 500 | `src/menu-discovery.js:33` checks primitive string types before format/equality validation, so arrays cannot reach SQL binding. | Closed |

The new API regressions are meaningful: deletion followed by an unrelated edit retains another complement; malformed start and end arrays return `400 invalid_schedule` and preserve the saved schedule; a real 104-candidate history with its first 100 candidates unavailable yields the first three eligible IDs in deterministic order.

Evidence inspected: `backend-review-red.log` records the expected 400-versus-200 and 500-versus-400 failures, then `backend-review-green.log` records 21/21 passing targeted tests. `backend-limit-red.log` records the expected `none` versus `orders` failure; `backend-limit-green.log` records 22/22 passing targeted tests including the 104-candidate regression. I read current source and test assertions against these logs; I did not rerun suites or claim independent whole-suite execution. No source changes or remote actions were performed during this recheck. Only this report was updated.

---

# Initial phase 1 backend review (superseded by fix recheck)

Reviewed 2026-11-05 on `codex/next-customer-menu`, base HEAD `ac3865ce6394ae816f61a6107daef3d491e27a6c`. Scope: `review-server.diff` (SHA256 `563c03696c189bc3eefc97db6a79140429010b5477270b069e1fc31bd84ce050`), its backend source, additive migration 0026, and backend test evidence. Client/performance workers and unfinished files are outside this review.

**Spec verdict: changes requested.** The shared API contracts are implemented, but ordinary complement deletion breaks existing item editing, and the historical recommendation limit can suppress qualifying available items. These contradict compatible owner edits and the orders-first recommendation contract.

**Code-quality verdict: changes requested.** Two confirmed P2 correctness defects and one P3 validation defect. The separation into discovery helpers is useful; no unrelated refactor is requested. No new pricing, idempotency, private QR, tenant authorization, or demo payment regression was identified in the reviewed diff.

## Findings

### P2 — Deleting a complementary item blocks unrelated edits of its referrers

Location: `src/menu-discovery.js:29`, called by merged PATCH at `src/app.js:430` and `src/app.js:436`.

Every PATCH revalidates all stored complementary IDs, including fields the request omitted. Existing item DELETE physically removes an unreferenced item without removing JSON complement references. Consequently, an item pointing to the deleted item cannot be renamed, repriced, deactivated, or otherwise updated through existing clients unless the client also explicitly repairs the new complement field.

Confirmed with real local SQLite-backed D1/API calls:

1. Create B, then create A with `complementary_ids:[B.id]`.
2. `DELETE /api/owner/items/B.id` returns `200 {ok:true,deleted:true}`.
3. `PATCH /api/owner/items/A.id {name_en:'Updated'}` returns `400 {error:'invalid_complementary_ids'}`.
4. The same PATCH with `complementary_ids:[]` returns 200.

Expected: unrelated edits remain compatible after normal item deletion. Clean references during deletion, or handle stale stored references when merging an omitted field while continuing to reject explicitly submitted invalid/foreign IDs. Add a regression spanning deletion and a legacy PATCH that does not know about complements.

### P2 — Historical LIMIT runs before availability filtering, hiding valid recommendations

Location: `src/menu-discovery.js:66` through `src/menu-discovery.js:70`.

The SQL chooses the first 100 qualifying historical item IDs, then JavaScript removes IDs absent/unavailable in the current menu. If those 100 items have been deleted, hidden, sold out, or scheduled off, a supported available item ranked 101st is never considered. The endpoint returns merchant fallback or `source:'none'` despite an available item with at least three supporting orders. This is reachable with the existing 500/5000-item plan limits and catalog turnover within the 30-day window.

Confirmed using the real local D1 adapter and `recommendations` helper with synthetic accepted history: 101 distinct pair candidates, each supported by three orders inside the window; the first 100 IDs are no longer in the visible menu, while `zzz-current-item` remains available. All history is scoped to the same branch/org. Result: `{source:'none',sample_size:0,items:[]}` although a separate query confirms three supporting orders for the current item.

Expected: select qualifying available candidates before the final limit, or page through bounded historical candidates until three valid results are obtained or the history is exhausted. Preserve tenant/branch, schedule and current availability checks.

### P3 — Schedule validation accepts array times and produces a server error

Location: `src/menu-discovery.js:33` and persistence at `src/menu-discovery.js:82`.

`RegExp.test` coerces values to strings, so `start:['10:00']` passes the HH:mm check. The array then reaches D1 binding and throws. An authenticated owner receives `500 server_error` for a malformed schedule instead of the documented validation response. This does not establish tenant escape or persistent corruption; the observed effect is an incorrect server-error response.

Confirmed local API reproduction: PUT an owned branch/category schedule with `{schedule:{days:[1],start:['10:00'],end:'11:00'}}` returns `500 {error:'server_error'}`. Array values for both equal start/end also bypass the strict equality check before failing persistence.

Require primitive strings for start/end before validating their format and equality. Add a focused malformed-type regression expecting `400 invalid_schedule`.

## Verified design and limits

- Gallery and dietary values are explicit, bounded fields. No server fetch of gallery URLs is introduced. Existing unknown calories remain null. New item response fields are additive.
- Owner schedule routes reuse `requireRole('owner')`, including org/subscription write checks. Branch and category ownership are checked. Complement writes check org scope; public recommendations resolve items through the branch's public menu.
- Riyadh helpers use UTC+3, starting-day ownership for overnight windows, inclusive starts and exclusive ends. Fresh checkout checks category schedules; the existing idempotent receipt branch executes before current availability validation. Server option pricing remains in `priceWithOptions`.
- Count queries use distinct accepted order IDs, branch/org scope and date bounds, excluding cancelled tickets. Recommendations require three supporting orders and do not return ticket tokens or customer identities.
- Migration 0026 is additive and supplies an order lookup index. Apply it before updated code.
- The backend report records 19 passing targeted tests. I did not repeat those suites or the full suite. I ran only focused in-memory diagnostics to substantiate the three findings above; these are local synthetic fixtures, not production mutations.

Instructions consulted: `/workspace/AGENTS.md`, project `CLAUDE.md`, toolkit installation limitations, `docs/NEXT-LEVEL-PLAN.md` Global Constraints/Review Focus/shared interfaces/Task 1, and `backend-report.md`. Used the local engineering code-review skill's separate spec/quality approach within the explicit single-reviewer scope; no children were spawned. Graphify was queried before source investigation. No source files, remote providers, secrets, external services, or graph files were changed. Only this review report was written.
