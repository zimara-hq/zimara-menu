// Browser acceptance against a local `wrangler dev` (default http://localhost:8787).
// Usage: node test/e2e/journey.mjs [baseUrl] [screenshotDir]
// Needs a platform admin: ADMIN_EMAIL / ADMIN_PASSWORD (defaults match local setup in README).
import { createRequire } from 'node:module';
// Uses the machine's installed Playwright (CJS, resolved via NODE_PATH or local node_modules).
const { chromium } = createRequire(import.meta.url)('playwright');
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] || 'http://localhost:8787';
const shots = process.argv[3] || 'test/e2e/screens';
mkdirSync(shots, { recursive: true });
const adminEmail = process.env.ADMIN_EMAIL || 'root@zimara.test';
const adminPassword = process.env.ADMIN_PASSWORD || 'local-pass-123';
const run = Date.now().toString(36);
const errors = [];

const browser = await chromium.launch();
async function ctx(opts = {}) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, ...opts });
  const p = await c.newPage();
  p.on('pageerror', (e) => errors.push(`${p.url()}: ${e.message}`));
  p.on('console', (m) => m.type() === 'error' && !/favicon|fonts\.g|ERR_TUNNEL|net::ERR|status of (401|409)/.test(m.text()) && errors.push(`${p.url()}: ${m.text()}`));
  return p;
}
const shot = (p, name) => p.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
const step = (s) => console.log('✓', s);

async function login(p, email, password) {
  await p.goto(base + '/');
  await p.fill('#e', email);
  await p.fill('#p', password);
  await p.click('button[type=submit]');
  await p.waitForURL('**/app');
}

// 1. Platform admin creates a business with its owner account.
const admin = await ctx();
await login(admin, adminEmail, adminPassword);
await admin.fill('#f-name_ar', 'مقهى التجربة');
await admin.fill('#f-name_en', `Trial Cafe ${run}`);
await admin.fill('#f-o_name', 'Owner');
await admin.fill('#f-o_email', `owner-${run}@trial.test`);
await admin.fill('#f-o_password', 'owner-pass-123');
await admin.click('#new button');
await admin.getByText(`owner-${run}@trial.test`).waitFor();
await shot(admin, '01-admin-orgs');
step('admin created business + owner');

// 2. Owner adds a branch with its account, a category and an item.
const owner = await ctx();
await login(owner, `owner-${run}@trial.test`, 'owner-pass-123');
await owner.fill('#f-name_ar', 'فرع حائل');
await owner.fill('#f-name_en', 'Hail');
await owner.fill('#f-google_review_url', 'https://g.page/r/example/review');
await owner.fill('#f-a_name', 'Cashier');
await owner.fill('#f-a_email', `hail-${run}@trial.test`);
await owner.fill('#f-a_password', 'branch-pass-123');
await owner.click('#new button');
await owner.locator('.qr').first().waitFor();
await shot(owner, '02-owner-branches');
const menuHref = await owner.locator('.qr + p a').first().getAttribute('href');
await owner.click('[data-k=menu]');
await owner.fill('#f-c_ar', 'قهوة');
await owner.fill('#f-c_en', 'Coffee');
await owner.click('#cat button');
await owner.locator('#item').waitFor();
await owner.fill('#item #f-name_ar', 'لاتيه');
await owner.fill('#item #f-name_en', 'Latte');
await owner.fill('#item #f-price', '18.5');
await owner.fill('#item #f-calories', '190');
await owner.fill('#item #f-desc_ar', 'إسبريسو مع حليب مبخر');
await owner.click('#item button');
await owner.locator('summary', { hasText: 'لاتيه' }).waitFor();
await owner.click('[data-k=loyalty]');
await owner.fill('#f-stamps_required', '3');
await owner.click('#f button');
await owner.getByText(/تم الحفظ|Saved/).waitFor();
step('owner created branch, menu and loyalty settings');

// 3. Public menu on a phone.
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const guest = await ctx(phone);
await guest.goto(menuHref);
await guest.getByText('لاتيه').waitFor();
assert.match(await guest.locator('.price').first().innerText(), /18[.,٫]50|١٨[.,٫]٥٠/);
await shot(guest, '03-menu-ar-mobile');
step('public menu renders with server prices');

// 4. Cashier issues a ticket; the customer scans and follows it.
const cashier = await ctx();
await login(cashier, `hail-${run}@trial.test`, 'branch-pass-123');
await cashier.fill('#num', '27');
await cashier.click('#nt button');
await cashier.locator('#issued .ticket-num').waitFor();
const ticketToken = await cashier.evaluate(() => JSON.parse(localStorage.getItem('zm_last_ticket')).token);
await shot(cashier, '04-cashier-issued');
await guest.goto(`${base}/t/${ticketToken}`);
await guest.getByText('قيد التحضير').waitFor();
await guest.click('#enable').catch(() => {});
await shot(guest, '05-ticket-preparing-mobile');
await cashier.getByText(/العميل مربوط|Customer linked/).waitFor({ timeout: 10000 });
step('customer linked to ticket');

// Duplicate number from a second cashier session is refused.
const cashier2 = await ctx();
await login(cashier2, `hail-${run}@trial.test`, 'branch-pass-123');
await cashier2.fill('#num', '27');
await cashier2.click('#nt button');
await cashier2.getByText(/مستخدم لطلب مفتوح|already open/).waitFor();
step('duplicate open number refused across sessions');

// 5. Ready -> customer sees it -> acknowledges.
await cashier.locator('.ticket', { hasText: '27' }).locator('[data-a=ready]').click();
await guest.getByText('طلبك جاهز!').waitFor({ timeout: 10000 });
await shot(guest, '06-ticket-ready-mobile');
await guest.click('#seen');
await guest.getByText(/الموظف يعرف/).waitFor();
await cashier.getByText(/^شاف التنبيه/).waitFor({ timeout: 10000 });
await shot(cashier, '07-cashier-ready-seen');
step('ready alert reached customer; acknowledgment is separate from pickup');

// Reload keeps state.
await guest.reload();
await guest.getByText('طلبك جاهز!').waitFor();
step('state persists after reload');

// 6. Collect -> rate -> Google review link.
await cashier.locator('.ticket', { hasText: '27' }).locator('[data-a=collect]').click();
await guest.getByText('تم الاستلام، بالعافية!').waitFor({ timeout: 20000 });
await guest.click('[data-star="5"]');
await guest.getByText('شكرًا على تقييمك!').waitFor();
assert.equal(await guest.locator('a[href="https://g.page/r/example/review"]').count(), 1);
await shot(guest, '08-ticket-rated-mobile');
step('collected, rated, Google review invite shown');

// 7. Display screen.
await cashier.fill('#num', '28');
await cashier.click('#nt button');
await cashier.click('[data-k=display]');
await cashier.locator('#lt .qr').waitFor();
await shot(cashier, '09-display');
step('front display shows latest QR');

// 8. Loyalty: customer gets a card, cashier stamps it.
const joinHref = new URL(menuHref).origin + '/j/' + (await guest.evaluate(() => document.querySelector('a[href^="/j/"]')?.getAttribute('href').split('/')[2]));
await guest.goto(joinHref);
await guest.click('#go');
await guest.waitForURL('**/c/**');
const code = (await guest.locator('strong').first().innerText()).trim();
await cashier.click('[data-k=loyalty]');
await cashier.fill('#code', code.toLowerCase());
await cashier.click('#f button');
for (let i = 0; i < 3; i++) {
  await cashier.click('#st');
  await cashier.getByText(new RegExp(`${i + 1} أختام|${i + 1} stamps`)).waitFor();
}
await cashier.click('#rd');
await cashier.getByText(/0 أختام|0 stamps/).waitFor();
await guest.reload();
await guest.getByText(/0 من 3/).waitFor();
await shot(guest, '10-card-mobile');
step('loyalty stamps x3 then atomic redeem');

// 9. English + dark mode render.
const en = await ctx({ ...phone, colorScheme: 'dark' });
await en.goto(menuHref + '?lang=en');
await en.getByText('Latte').waitFor();
assert.equal(await en.evaluate(() => document.documentElement.dir), 'ltr');
await shot(en, '11-menu-en-dark-mobile');
await en.goto(`${base}/t/${ticketToken}?lang=en`);
await en.getByText('Collected. Enjoy!').waitFor();
await shot(en, '12-ticket-en-dark-mobile');
step('English LTR and dark mode');

// 10. Keyboard: login form reachable and submittable by keyboard.
const kb = await ctx();
await kb.goto(base + '/');
await kb.locator('#e').focus();
await kb.keyboard.type(`owner-${run}@trial.test`);
await kb.keyboard.press('Tab');
await kb.keyboard.type('owner-pass-123');
await kb.keyboard.press('Enter');
await kb.waitForURL('**/app');
step('keyboard-only login');

await browser.close();
if (errors.length) {
  console.error('JS errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('All browser checks passed.');
