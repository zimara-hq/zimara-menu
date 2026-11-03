// Waitlist with numbers: a guest scans the branch's waitlist QR, gives a name, party
// size and (optionally) a mobile number, and gets a page with their number, their
// place in line, the expected wait and a call alert. Staff run the list from the
// branch screen: call, seat, cancel, no-show, or add a walk-in.
import { requireRole, body, audit, rateLimit, assertOrgWritable } from './context.js';
import { bad, conflict, notFound, str, int, id, now, randomToken, HttpError } from './util.js';
import { normalPhone } from './ordering.js';
import { sendPush, pushConfigured, validEndpoint } from './push.js';

export const WAIT_MAX_ALERTS = 4; // first call + 3 automatic repeats
const REPEAT_EVERY_MS = 60_000;
const OPEN_TTL_MS = 12 * 3600_000;
const MAX_OPEN = 300;
const DAY = 86_400_000, RIYADH = 3 * 3600_000;
const DEFAULT = { active: 0, minutes_per_party: 8, max_party: 12 };
const OPEN = "('waiting','called')";

export async function waitSettings(env, branchId) {
  const r = await env.DB.prepare('SELECT active, minutes_per_party, max_party FROM waitlist_settings WHERE branch_id=?').bind(branchId).first();
  return { ...DEFAULT, ...(r || {}), active: Boolean(r?.active) };
}

const startOfDay = (t) => Math.floor((t + RIYADH) / DAY) * DAY - RIYADH;

async function publicBranch(env, slug) {
  const b = await env.DB.prepare(
    `SELECT b.id, b.org_id, b.slug, b.name_ar, b.name_en, o.slug AS org_slug, o.name_ar AS org_ar, o.name_en AS org_en, o.brand_color, o.logo_url
       FROM branches b JOIN orgs o ON o.id=b.org_id WHERE b.slug=? AND b.active=1 AND o.active=1`,
  ).bind(slug).first();
  if (!b) throw notFound();
  return b;
}

async function queueStats(env, branchId) {
  return env.DB.prepare("SELECT COUNT(*) AS waiting, COALESCE(SUM(party),0) AS people FROM waitlist WHERE branch_id=? AND status='waiting'").bind(branchId).first();
}

// Inserts with the next number of the (Riyadh) day; retries when two joins race for it.
async function insertEntry(env, { orgId, branchId, name, phone, party, note, source }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const t = now();
    const last = await env.DB.prepare(`SELECT MAX(number) AS n FROM waitlist WHERE branch_id=? AND (created_at>=? OR status IN ${OPEN})`).bind(branchId, startOfDay(t)).first();
    const entry = { id: id(), token: randomToken(18), number: (last?.n || 0) + 1 };
    try {
      await env.DB.prepare('INSERT INTO waitlist(id,org_id,branch_id,number,token,name,phone,party,note,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .bind(entry.id, orgId, branchId, entry.number, entry.token, name, phone, party, note, source, t).run();
      return entry;
    } catch (error) {
      if (!/UNIQUE|constraint/i.test(String(error?.message ?? error)) || attempt === 2) throw error;
    }
  }
}

function guestFields(b, settings) {
  const name = str(b.name, 'name', { max: 60 });
  if (/[\x00-\x1f\x7f<>]/.test(name)) throw bad('invalid_name');
  const party = int(b.party, 'party', { min: 1, max: settings.max_party });
  const phone = normalPhone(b.phone || null, 'phone', true);
  const note = str(b.note, 'note', { optional: true, max: 140 });
  return { name, party, phone, note };
}

async function entryByToken(env, token) {
  const e = await env.DB.prepare(
    `SELECT w.*, b.slug AS branch_slug, b.name_ar AS branch_ar, b.name_en AS branch_en,
            o.slug AS org_slug, o.name_ar AS org_ar, o.name_en AS org_en, o.brand_color, o.logo_url,
            (SELECT active FROM loyalty_programs p WHERE p.org_id=w.org_id) AS loyalty
       FROM waitlist w JOIN branches b ON b.id=w.branch_id JOIN orgs o ON o.id=w.org_id WHERE w.token=?`,
  ).bind(String(token).slice(0, 64)).first();
  if (!e) throw notFound();
  return e;
}

async function guestView(env, e) {
  const settings = await waitSettings(env, e.branch_id);
  let position = null, eta = null;
  if (e.status === 'waiting') {
    const ahead = await env.DB.prepare("SELECT COUNT(*) AS n FROM waitlist WHERE branch_id=? AND status='waiting' AND (created_at<? OR (created_at=? AND number<?))")
      .bind(e.branch_id, e.created_at, e.created_at, e.number).first();
    position = ahead.n + 1;
    eta = position * settings.minutes_per_party;
  }
  return {
    number: e.number, name: e.name, party: e.party, status: e.status, position, eta_minutes: eta,
    called_at: e.called_at, seen_at: e.seen_at, alerts_sent: e.alerts_sent, created_at: e.created_at,
    branch_slug: e.branch_slug, branch_ar: e.branch_ar, branch_en: e.branch_en,
    org_slug: e.org_slug, org_ar: e.org_ar, org_en: e.org_en, brand_color: e.brand_color, logo_url: e.logo_url,
    loyalty: Boolean(e.loyalty), vapidPublicKey: pushConfigured(env) ? env.VAPID_PUBLIC_KEY : null,
  };
}

export async function alertEntry(env, entryId, fetcher) {
  const { results } = await env.DB.prepare('SELECT id, endpoint FROM waitlist_push WHERE entry_id=?').bind(entryId).all();
  const outcome = { sent: 0, failed: 0, subscriptions: results.length };
  for (const s of results) {
    const r = await sendPush(env, s.endpoint, fetcher);
    if (r === 'ok') outcome.sent++;
    else {
      outcome.failed++;
      if (r === 'gone') await env.DB.prepare('DELETE FROM waitlist_push WHERE id=?').bind(s.id).run();
    }
  }
  return outcome;
}

// Cron: repeat an unseen call every minute (3 repeats), expire stale entries.
export async function waitlistCron(env, fetcher) {
  const t = now();
  const { results } = await env.DB.prepare("SELECT id FROM waitlist WHERE status='called' AND seen_at IS NULL AND alerts_sent<? AND last_alert_at<=?")
    .bind(WAIT_MAX_ALERTS, t - REPEAT_EVERY_MS).all();
  for (const r of results) {
    const res = await env.DB.prepare("UPDATE waitlist SET alerts_sent=alerts_sent+1, last_alert_at=? WHERE id=? AND status='called' AND seen_at IS NULL AND alerts_sent<?")
      .bind(t, r.id, WAIT_MAX_ALERTS).run();
    if (res.meta.changes) await alertEntry(env, r.id, fetcher);
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE waitlist SET status='cancelled', done_at=?, version=version+1 WHERE status IN ${OPEN} AND created_at<?`).bind(t, t - OPEN_TTL_MS),
    env.DB.prepare(`DELETE FROM waitlist_push WHERE entry_id IN (SELECT id FROM waitlist WHERE status NOT IN ${OPEN})`),
  ]);
  return { recalled: results.length };
}

const STAFF_COLS = 'id, number, name, phone, party, note, source, status, called_at, seen_at, done_at, alerts_sent, last_alert_at, created_at, version';

export function registerWaitlist(app) {
  const owner = requireRole('owner');
  const branchOnly = requireRole('branch');

  app.get('/api/owner/branches/:branchId/waitlist', owner, async (c) => {
    const br = await c.env.DB.prepare('SELECT id FROM branches WHERE id=? AND org_id=?').bind(c.req.param('branchId'), c.get('user').org_id).first();
    if (!br) throw notFound();
    return c.json({ settings: await waitSettings(c.env, br.id) });
  });
  app.patch('/api/owner/branches/:branchId/waitlist', owner, async (c) => {
    const br = await c.env.DB.prepare('SELECT id FROM branches WHERE id=? AND org_id=?').bind(c.req.param('branchId'), c.get('user').org_id).first();
    if (!br) throw notFound();
    const b = await body(c), cur = await waitSettings(c.env, br.id);
    const s = {
      active: b.active === undefined ? cur.active : Boolean(b.active),
      minutes_per_party: b.minutes_per_party === undefined ? cur.minutes_per_party : int(b.minutes_per_party, 'minutes_per_party', { min: 1, max: 120 }),
      max_party: b.max_party === undefined ? cur.max_party : int(b.max_party, 'max_party', { min: 1, max: 50 }),
    };
    await c.env.DB.prepare('INSERT INTO waitlist_settings(branch_id,active,minutes_per_party,max_party,updated_at) VALUES(?1,?2,?3,?4,?5) ON CONFLICT(branch_id) DO UPDATE SET active=?2,minutes_per_party=?3,max_party=?4,updated_at=?5')
      .bind(br.id, s.active ? 1 : 0, s.minutes_per_party, s.max_party, now()).run();
    await audit(c.env, c.get('user'), 'branch.waitlist', { branch: br.id, active: s.active });
    return c.json({ settings: s });
  });

  // ---- guest ----
  app.get('/api/public/waitlist/:branchSlug', async (c) => {
    const b = await publicBranch(c.env, c.req.param('branchSlug'));
    const settings = await waitSettings(c.env, b.id);
    const q = await queueStats(c.env, b.id);
    const { id: _id, org_id: _org, ...branch } = b;
    return c.json({ branch, active: settings.active, max_party: settings.max_party, waiting: q.waiting, eta_minutes: (q.waiting + 1) * settings.minutes_per_party });
  });

  app.post('/api/public/waitlist/:branchSlug', async (c) => {
    const b = await publicBranch(c.env, c.req.param('branchSlug'));
    const settings = await waitSettings(c.env, b.id);
    if (!settings.active) throw conflict('waitlist_closed');
    await assertOrgWritable(c.env, { org_id: b.org_id });
    await rateLimit(c, 'waitlist-join', { limit: 6, window: 600_000 });
    const f = guestFields(await body(c), settings);
    // The same mobile already waiting gets its existing place back instead of a second one.
    if (f.phone) {
      const open = await c.env.DB.prepare(`SELECT token, number FROM waitlist WHERE branch_id=? AND phone=? AND status IN ${OPEN}`).bind(b.id, f.phone).first();
      if (open) return c.json({ token: open.token, number: open.number, duplicate: true });
    }
    const q = await queueStats(c.env, b.id);
    if (q.waiting >= MAX_OPEN) throw conflict('waitlist_full');
    const e = await insertEntry(c.env, { orgId: b.org_id, branchId: b.id, ...f, source: 'guest' });
    return c.json({ token: e.token, number: e.number }, 201);
  });

  app.get('/api/w/:token', async (c) => c.json(await guestView(c.env, await entryByToken(c.env, c.req.param('token')))));

  app.post('/api/w/:token/subscribe', async (c) => {
    const e = await entryByToken(c.env, c.req.param('token'));
    const b = await body(c);
    if (!validEndpoint(b.endpoint)) throw bad('invalid_endpoint');
    if (e.status !== 'waiting' && e.status !== 'called') throw conflict('entry_closed');
    const ins = await c.env.DB.prepare('INSERT OR IGNORE INTO waitlist_push(id,entry_id,endpoint,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM waitlist_push WHERE entry_id=?)<5')
      .bind(id(), e.id, b.endpoint, now(), e.id).run();
    if (!ins.meta.changes) {
      const existing = await c.env.DB.prepare('SELECT id FROM waitlist_push WHERE entry_id=? AND endpoint=?').bind(e.id, b.endpoint).first();
      if (!existing) throw new HttpError(429, 'push_device_limit');
    }
    return c.json({ ok: true });
  });

  app.post('/api/w/:token/seen', async (c) => {
    const e = await entryByToken(c.env, c.req.param('token'));
    await c.env.DB.prepare("UPDATE waitlist SET seen_at=? WHERE id=? AND status='called' AND seen_at IS NULL").bind(now(), e.id).run();
    return c.json(await guestView(c.env, await entryByToken(c.env, c.req.param('token'))));
  });

  app.post('/api/w/:token/cancel', async (c) => {
    const e = await entryByToken(c.env, c.req.param('token'));
    const r = await c.env.DB.prepare(`UPDATE waitlist SET status='cancelled', done_at=?, version=version+1 WHERE id=? AND status IN ${OPEN}`).bind(now(), e.id).run();
    if (!r.meta.changes) throw conflict('entry_closed');
    return c.json(await guestView(c.env, await entryByToken(c.env, c.req.param('token'))));
  });

  // ---- staff ----
  app.get('/api/branch/waitlist', branchOnly, async (c) => {
    const u = c.get('user');
    const { results } = await c.env.DB.prepare(
      `SELECT ${STAFF_COLS} FROM waitlist WHERE branch_id=? AND (status IN ${OPEN} OR created_at>?) ORDER BY created_at LIMIT 400`,
    ).bind(u.branch_id, now() - 3 * 3600_000).all();
    const br = await c.env.DB.prepare('SELECT slug FROM branches WHERE id=?').bind(u.branch_id).first();
    return c.json({ entries: results, settings: await waitSettings(c.env, u.branch_id), slug: br?.slug, now: now() });
  });

  app.post('/api/branch/waitlist', branchOnly, async (c) => {
    const u = c.get('user');
    const settings = await waitSettings(c.env, u.branch_id);
    const f = guestFields(await body(c), { ...settings, max_party: 50 });
    const q = await queueStats(c.env, u.branch_id);
    if (q.waiting >= MAX_OPEN) throw conflict('waitlist_full');
    const e = await insertEntry(c.env, { orgId: u.org_id, branchId: u.branch_id, ...f, source: 'staff' });
    return c.json({ id: e.id, number: e.number, token: e.token }, 201);
  });

  // action: call (also re-calls) | seat | cancel | no_show, with optimistic `version`.
  app.post('/api/branch/waitlist/:id/:action', branchOnly, async (c) => {
    const u = c.get('user');
    const action = c.req.param('action');
    const b = await body(c);
    const version = int(b.version, 'version', { min: 1 });
    const q = {
      call: ["status='called', called_at=COALESCE(called_at, ?2), seen_at=NULL, alerts_sent=alerts_sent+1, last_alert_at=?2", "status IN ('waiting','called')"],
      seat: ["status='seated', done_at=?2", `status IN ${OPEN}`],
      cancel: ["status='cancelled', done_at=?2", `status IN ${OPEN}`],
      no_show: ["status='no_show', done_at=?2", "status='called'"],
    }[action];
    if (!q) throw notFound();
    const res = await c.env.DB.prepare(`UPDATE waitlist SET ${q[0]}, version=version+1 WHERE id=?1 AND branch_id=?3 AND version=?4 AND ${q[1]}`)
      .bind(c.req.param('id'), now(), u.branch_id, version).run();
    const entry = await c.env.DB.prepare(`SELECT ${STAFF_COLS} FROM waitlist WHERE id=? AND branch_id=?`).bind(c.req.param('id'), u.branch_id).first();
    if (!entry) throw notFound();
    if (!res.meta.changes) return c.json({ error: 'stale', entry }, 409);
    const push = action === 'call' ? await alertEntry(c.env, entry.id) : null;
    return c.json({ entry, push });
  });
}
