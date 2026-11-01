import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const base = process.argv[2] || "http://127.0.0.1:8790",
  out = process.argv[3] || "output/playwright/resilience";
mkdirSync(out, { recursive: true });
const options = { headless: true },
  proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxy && !/^http:\/\/(localhost|127\.0\.0\.1):/.test(base)) {
  const u = new URL(proxy);
  options.proxy = {
    server: u.origin,
    ...(u.username
      ? {
          username: decodeURIComponent(u.username),
          password: decodeURIComponent(u.password),
        }
      : {}),
  };
}
const browser = await chromium.launch(options),
  checks = [],
  errors = [];
const owner = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
});
owner.setDefaultTimeout(15000);
owner.on("pageerror", (e) => errors.push(e.message));
const pass = (s) => {
  checks.push(s);
  console.log("PASS", s);
};
async function json(page, path, method = "GET", data) {
  const r = await page.request.fetch(base + path, {
    method,
    ...(data === undefined ? {} : { data }),
  });
  assert.ok(r.ok(), `${path}: ${r.status()} ${await r.text()}`);
  return r.json();
}
const tab = async (key) => {
  await owner.locator(`[data-k=${key}]`).click();
  await owner.locator("#panel-" + key).waitFor();
};
try {
  await owner.goto(base + "/demo");
  const room = await json(owner, "/api/demo", "POST", {});
  await json(owner, `/api/demo/${room.token}/session`, "POST", {
    role: "owner",
  });
  await owner.goto(base + "/app#brand");
  await owner.locator("#identity-form").waitFor();
  const f = owner.locator("#identity-form");
  const original = await f.locator("[name=name_ar]").inputValue();
  await f.locator("[name=name_ar]").fill("");
  await f.locator("[type=submit]").click();
  await f.locator("[name=name_ar][aria-invalid=true]").waitFor();
  assert.equal(
    await owner.evaluate(() => document.activeElement.name),
    "name_ar",
  );
  assert.ok(await f.locator(".field-error").count());
  await f.locator("[name=name_ar]").fill("اسم غير محفوظ");
  await owner.locator("[data-k=menu]").click();
  await owner.getByRole("dialog").waitFor();
  await owner
    .getByRole("button", { name: "متابعة التعديل", exact: true })
    .click();
  assert.equal(await f.locator("[name=name_ar]").inputValue(), "اسم غير محفوظ");
  assert.equal(
    await owner.locator("[data-k=brand]").getAttribute("aria-selected"),
    "true",
  );
  await owner.locator("[data-k=menu]").click();
  await owner
    .getByRole("button", { name: "مغادرة دون حفظ", exact: true })
    .click();
  await owner.locator("#panel-menu").waitFor();
  await tab("brand");
  assert.equal(
    await owner.locator("#identity-form [name=name_ar]").inputValue(),
    original,
  );
  pass(
    "field errors focus correctly; cancel keeps edits and discard never publishes them",
  );
  let attempts = 0;
  await owner.route("**/api/owner/profile", async (route) => {
    if (route.request().method() === "PATCH") {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"temporary_failure"}',
      });
    } else await route.continue();
  });
  await owner
    .locator("#identity-form [name=name_ar]")
    .fill("هوية محفوظة جزئيًا");
  await owner.locator("#identity-form [type=submit]").click();
  await owner.locator("#identity-form[aria-busy=true]").waitFor();
  assert.equal(
    await owner.locator("#identity-form [name=name_ar]").isDisabled(),
    true,
  );
  await owner
    .locator("#identity-status")
    .getByText("حُفظ الاسم والشعار واللون.", { exact: false })
    .waitFor();
  assert.equal(attempts, 1);
  assert.equal(
    await owner.locator("#identity-form [name=name_ar]").inputValue(),
    "هوية محفوظة جزئيًا",
  );
  assert.equal(
    await owner.locator("#identity-form").getAttribute("data-dirty"),
    "true",
  );
  await owner.unroute("**/api/owner/profile");
  await owner.locator("#identity-form [type=submit]").click();
  await owner.getByText("حُفظت الهوية وظهرت على صفحاتك العامة.").waitFor();
  assert.equal(
    await owner.locator("#identity-form").getAttribute("data-dirty"),
    "false",
  );
  pass(
    "server failure preserves entries and dirty state, blocks duplicate work and supports retry",
  );
  await tab("branches");
  const card = owner.locator(".branch-workspace").first();
  await card.waitFor();
  await card.locator(".branch-edit summary").click();
  const bf = card.locator("form");
  await bf.locator("[name=name_ar]").fill("فرع الاختبار");
  await bf.locator("[name=name_en]").fill("Test branch");
  await bf
    .locator("[name=google_review_url]")
    .fill("https://example.org/review");
  await bf.locator("[type=submit]").click();
  await card.getByText("حُفظت بيانات الفرع. رابط المنيو ثابت.").waitFor();
  const branch = (await json(owner, "/api/owner/branches")).branches[0];
  assert.equal(branch.name_ar, "فرع الاختبار");
  assert.equal(branch.slug, room.branch_slug);
  await bf.locator("[name=active]").uncheck();
  await bf.locator("[type=submit]").click();
  await owner.getByRole("dialog").waitFor();
  await owner.getByRole("button", { name: "إلغاء", exact: true }).click();
  assert.equal(
    (await json(owner, "/api/owner/branches")).branches[0].active,
    1,
  );
  await bf.locator("[type=submit]").click();
  await owner
    .getByRole("dialog")
    .getByRole("button", { name: "إيقاف الفرع", exact: true })
    .click();
  await owner.waitForFunction(
    () =>
      document.querySelector(".branch-workspace [data-branch-state]")
        ?.textContent === "موقوف",
  );
  const guest = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  guest.on("pageerror", (e) => errors.push(e.message));
  assert.equal(
    (
      await guest.request.get(base + "/api/public/menu/" + branch.slug)
    ).status(),
    404,
  );
  await bf.locator("[name=active]").check();
  await bf.locator("[type=submit]").click();
  await owner
    .getByRole("dialog")
    .getByRole("button", { name: "تفعيل الفرع", exact: true })
    .click();
  await owner.waitForFunction(
    () =>
      document.querySelector(".branch-workspace [data-branch-state]")
        ?.textContent === "فعّال",
  );
  assert.equal(
    (
      await guest.request.get(base + "/api/public/menu/" + branch.slug)
    ).status(),
    200,
  );
  pass(
    "branch rename keeps links stable; confirmed deactivation blocks public access and reactivation restores it",
  );
  const cashier = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  cashier.on("pageerror", (e) => errors.push(e.message));
  await cashier.goto(base + "/demo");
  await json(cashier, `/api/demo/${room.token}/session`, "POST", {
    role: "branch",
  });
  await cashier.goto(base + "/app#inbox");
  await cashier.locator("[data-state=connected]").waitFor();
  await card.locator("[data-account-toggle]").click();
  await owner
    .getByRole("dialog")
    .getByRole("button", { name: "إيقاف الحساب", exact: true })
    .click();
  await card.getByText("حُدثت صلاحية الحساب.").waitFor();
  assert.equal(
    (await cashier.request.get(base + "/api/branch/tickets")).status(),
    401,
  );
  await card.locator("[data-account-toggle]").click();
  await owner
    .getByRole("dialog")
    .getByRole("button", { name: "تفعيل الحساب", exact: true })
    .click();
  await card
    .locator("[data-account-toggle]")
    .getByText("إيقاف الحساب", { exact: true })
    .waitFor();
  await json(cashier, `/api/demo/${room.token}/session`, "POST", {
    role: "branch",
  });
  await cashier.reload();
  await cashier.locator("[data-state=connected]").waitFor();
  pass(
    "cashier access can be disabled and restored; prior sessions are invalidated",
  );
  await bf.locator("[name=name_en]").fill("Unpublished branch draft");
  await owner.locator(".branch-add summary").click();
  const create = owner.locator("#new-branch-form");
  for (const [name, value] of Object.entries({
    name_ar: "فرع إضافي",
    name_en: "Extra branch",
    a_name: "Cashier",
    a_email: "new-branch-" + Date.now() + "@demo.invalid",
    a_password: "cashier-pass-123",
  }))
    await create.locator(`[name=${name}]`).fill(value);
  await create.locator("[type=submit]").click();
  await owner.waitForFunction(
    () => document.querySelectorAll(".branch-workspace").length === 2,
  );
  assert.equal(
    await bf.locator("[name=name_en]").inputValue(),
    "Unpublished branch draft",
  );
  await bf.locator("[name=name_en]").fill("Test branch");
  await bf.locator("[type=submit]").click();
  await owner.waitForFunction(
    () =>
      document.querySelector(".branch-workspace form")?.dataset.dirty ===
      "false",
  );
  pass(
    "creating a branch preserves edits in other branch forms and refreshes actual branch totals",
  );
  await json(owner, `/api/owner/branches/${branch.id}/settings`, "PATCH", {
    orders_enabled: true,
  });
  const menu = await json(guest, "/api/public/menu/" + branch.slug),
    item = menu.items[0];
  const createOrder = () =>
    json(guest, "/api/public/orders/" + branch.slug, "POST", {
      idem_key: crypto.randomUUID(),
      items: [{ item_id: item.id, quantity: 1 }],
    });
  const order = await createOrder();
  const orderCard = cashier.locator(`[data-order-id="${order.order.id}"]`);
  await orderCard.waitFor({ timeout: 20000 });
  await orderCard.locator("input").fill("INV-RESILIENCE-12");
  await cashier.waitForTimeout(5500);
  assert.equal(
    await orderCard.locator("input").inputValue(),
    "INV-RESILIENCE-12",
  );
  let startPoll;
  const started = new Promise((resolve) => (startPoll = resolve));
  const delayedPoll = async (route) => {
    if (route.request().method() === "GET") {
      startPoll();
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    await route.continue();
  };
  await cashier.route("**/api/branch/orders", delayedPoll);
  await cashier.click("#refresh-inbox");
  await started;
  await orderCard.locator("[data-action=accept]").click();
  await cashier
    .locator("#inbox-message")
    .getByText("قُبل الطلب وأنشئ النداء", { exact: false })
    .waitFor();
  await cashier.unrouteAll({ behavior: "wait" });
  const stored = (await json(cashier, "/api/branch/tickets")).tickets.find(
    (t) => t.invoice_number === "INV-RESILIENCE-12",
  );
  assert.ok(stored);
  pass(
    "cashier receives orders automatically; acceptance waits for a slow poll and preserves its invoice",
  );
  const second = await createOrder();
  const secondCard = cashier.locator(`[data-order-id="${second.order.id}"]`);
  await secondCard.waitFor({ timeout: 20000 });
  await cashier.route(
    "**/api/branch/orders/" + second.order.id + "/accept",
    async (route) => {
      await json(
        cashier,
        `/api/branch/orders/${second.order.id}/reject`,
        "POST",
        { version: 1 },
      );
      await route.continue();
    },
  );
  await secondCard.locator("[data-action=accept]").click();
  await cashier
    .getByText("تغيّر الطلب من جهاز آخر.", { exact: false })
    .waitFor();
  await cashier.unrouteAll({ behavior: "wait" });
  assert.equal(
    (await json(guest, "/api/public/order/" + second.order.token)).order.status,
    "rejected",
  );
  pass(
    "stale acceptance is rejected and reconciled without creating a duplicate pager",
  );
  await cashier.route("**/api/branch/orders", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"temporary_failure"}',
    }),
  );
  await cashier.click("#refresh-inbox");
  await cashier.locator("[data-state=error]").waitFor();
  await cashier.unroute("**/api/branch/orders");
  await cashier.click("#refresh-inbox");
  await cashier.locator("[data-state=connected]").waitFor();
  pass(
    "poll failures show an honest connection state and manual recovery works",
  );
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.evaluate(() => scrollTo(0, 0));
  await owner.screenshot({
    path: out + "/branches-mobile.png",
    fullPage: true,
  });
  assert.equal(
    await owner.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await cashier.click("[data-filter=all]");
  await cashier.evaluate(() => scrollTo(0, 0));
  await cashier.screenshot({
    path: out + "/inbox-desktop.png",
    fullPage: true,
  });
  await cashier.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await cashier.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await cashier.screenshot({ path: out + "/inbox-mobile.png", fullPage: true });
  assert.deepEqual(errors, []);
  pass("new branch and cashier views fit mobile with no JavaScript errors");
  writeFileSync(
    out + "/results.json",
    JSON.stringify(
      { base, at: new Date().toISOString(), checks, errors },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
