import test from "node:test";
import assert from "node:assert/strict";
import { makeEnv, setupOrg, client } from "./helpers.js";

test("branch management is tenant-scoped, audited and reversible without changing public links", async () => {
  const env = makeEnv(),
    s = await setupOrg(env),
    other = client(env, "2.2.2.2");
  await other.post("/api/register", {
    name_ar: "منشأة أخرى",
    name_en: "Other",
    slug: "branch-management-other",
    name: "Other",
    email: "branch-management@example.test",
    password: "owner-pass-123",
    sector: "cafe",
    accept_terms: true,
  });
  const before = (await s.owner.get("/api/owner/branches")).json.branches[0];
  const values = {
    name_ar: "فرع الحديقة",
    name_en: "Garden branch",
    google_review_url: "https://example.org/review",
    active: false,
  };
  assert.equal(
    (await other.patch("/api/owner/branches/" + s.branchId, values)).status,
    404,
  );
  assert.equal(
    (await s.owner.patch("/api/owner/branches/" + s.branchId, values)).status,
    200,
  );
  assert.equal(
    (await client(env).get("/api/public/menu/" + s.branchSlug)).status,
    404,
  );
  assert.equal((await s.cashier.get("/api/branch/tickets")).status, 403);
  assert.equal(
    (
      await s.owner.patch("/api/owner/branches/" + s.branchId, {
        ...values,
        active: true,
      })
    ).status,
    200,
  );
  const after = (await s.owner.get("/api/owner/branches")).json.branches[0];
  assert.equal(after.slug, before.slug);
  assert.equal(after.name_en, "Garden branch");
  assert.equal(
    (await client(env).get("/api/public/menu/" + s.branchSlug)).status,
    200,
  );
  const { results } = await env.DB.prepare(
    "SELECT org_id,action FROM audit_log WHERE action='branch.update'",
  ).all();
  assert.equal(results.length, 2);
  assert.ok(results.every((row) => row.org_id === before.org_id));
});
