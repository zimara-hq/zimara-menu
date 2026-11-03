// Loyalty depth: guest segments from visit history, messages to card holders
// (one-off by segment, and an automatic win-back after N days away), and push
// alerts on the card page. Cards stay anonymous: no names or numbers are stored.
import { requireRole, body, audit } from './context.js';
import { bad, conflict, notFound, str, id, now, HttpError } from './util.js';
import { sendPush, validEndpoint } from './push.js';

const DAY = 86_400_000;
export const SEGMENTS = ['vip', 'regular', 'new', 'at_risk', 'dormant'];
const MAX_CARDS_SCAN = 5000;
const MESSAGES_PER_DAY = 2;

// vip: 6+ visits in 60 days. dormant: 60+ days away. at_risk: came 2+ times, away 21-59 days.
// new: one visit (or none) in the last 21 days. regular: everyone else.
export function segmentOf(c, t = now()) {
  const away = c.last_visit ? (t - c.last_visit) / DAY : (t - c.created_at) / DAY;
  if (c.visits_60 >= 6) return 'vip';
  if (away >= 60) return 'dormant';
  if (c.visits >= 2 && away >= 21) return 'at_risk';
  if (c.visits <= 1) return 'new';
  return 'regular';
}

export async function customers(env, orgId, t = now()) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.code, c.created_at, c.winback_at,
            COALESCE(SUM(CASE WHEN l.kind = 'stamp' THEN 1 ELSE 0 END), 0) AS visits,
            COALESCE(SUM(CASE WHEN l.kind = 'stamp' AND l.created_at > ?2 THEN 1 ELSE 0 END), 0) AS visits_60,
            MAX(CASE WHEN l.kind = 'stamp' THEN l.created_at END) AS last_visit,
            COALESCE(SUM(CASE WHEN l.kind = 'redeem' THEN 1 ELSE 0 END), 0) AS redeemed,
            COALESCE(SUM(l.amount), 0) AS spent,
            COALESCE(SUM(l.delta), 0) AS balance,
            (SELECT COUNT(*) FROM card_push p WHERE p.card_id = c.id) AS reachable
       FROM loyalty_cards c LEFT JOIN loyalty_ledger l ON l.card_id = c.id
      WHERE c.org_id = ?1 AND c.revoked_at IS NULL
      GROUP BY c.id ORDER BY last_visit DESC NULLS LAST, c.created_at DESC LIMIT ?3`,
  ).bind(orgId, t - 60 * DAY, MAX_CARDS_SCAN).all();
  return results.map((c) => ({ ...c, segment: segmentOf(c, t), reachable: c.reachable > 0 }));
}

async function deliver(env, message, cardIds, fetcher) {
  let sent = 0;
  for (let i = 0; i < cardIds.length; i += 50) {
    const chunk = cardIds.slice(i, i + 50);
    await env.DB.batch(chunk.map((cid) => env.DB.prepare('INSERT OR IGNORE INTO card_inbox(card_id,message_id,created_at) VALUES(?,?,?)').bind(cid, message.id, now())));
    const { results } = await env.DB.prepare(`SELECT id, endpoint FROM card_push WHERE card_id IN (${chunk.map(() => '?').join(',')})`).bind(...chunk).all();
    for (const s of results) {
      const r = await sendPush(env, s.endpoint, fetcher);
      if (r === 'ok') sent++;
      else if (r === 'gone') await env.DB.prepare('DELETE FROM card_push WHERE id=?').bind(s.id).run();
    }
  }
  await env.DB.prepare('UPDATE loyalty_messages SET recipients=?, sent=? WHERE id=?').bind(cardIds.length, sent, message.id).run();
  return { recipients: cardIds.length, sent };
}

function messageFields(b) {
  const clean = (v, f, max, optional = false) => {
    const s = str(v, f, { max, optional });
    if (s && /[\x00-\x08\x0b-\x1f\x7f<>]/.test(s)) throw bad('invalid_' + f);
    return s;
  };
  const title_ar = clean(b.title_ar, 'title', 60), body_ar = clean(b.body_ar, 'body', 240);
  return { title_ar, body_ar, title_en: clean(b.title_en, 'title', 60, true) || title_ar, body_en: clean(b.body_en, 'body', 240, true) || body_ar };
}

// Cron: guests away `winback_days` get the program's win-back message once per absence.
export async function winbackCron(env, fetcher) {
  const t = now();
  const { results: programs } = await env.DB.prepare(
    'SELECT p.org_id, p.winback_days, p.winback_ar, p.winback_en FROM loyalty_programs p JOIN orgs o ON o.id=p.org_id WHERE p.active=1 AND o.active=1 AND p.winback_days>0 AND p.winback_ar IS NOT NULL',
  ).all();
  let total = 0;
  for (const p of programs) {
    const cutoff = t - p.winback_days * DAY;
    // Away long enough, has visited at least once, and not already won back since the last visit.
    const { results } = await env.DB.prepare(
      `SELECT c.id FROM loyalty_cards c JOIN (SELECT card_id, MAX(created_at) AS last FROM loyalty_ledger WHERE kind='stamp' GROUP BY card_id) l ON l.card_id=c.id
        WHERE c.org_id=? AND c.revoked_at IS NULL AND l.last<? AND l.last>? AND (c.winback_at IS NULL OR c.winback_at<l.last) LIMIT 500`,
    ).bind(p.org_id, cutoff, cutoff - 30 * DAY).all();
    if (!results.length) continue;
    const ids = results.map((r) => r.id);
    const message = { id: id() };
    await env.DB.prepare('INSERT INTO loyalty_messages(id,org_id,segment,title_ar,title_en,body_ar,body_en,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(message.id, p.org_id, 'winback', 'وحشتنا!', 'We miss you!', p.winback_ar, p.winback_en || p.winback_ar, t).run();
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      await env.DB.prepare(`UPDATE loyalty_cards SET winback_at=? WHERE id IN (${chunk.map(() => '?').join(',')})`).bind(t, ...chunk).run();
    }
    total += (await deliver(env, message, ids, fetcher)).recipients;
  }
  return { winback: total };
}

export function registerLoyalty(app) {
  const owner = requireRole('owner');

  app.get('/api/owner/loyalty/customers', owner, async (c) => {
    const list = await customers(c.env, c.get('user').org_id);
    const counts = Object.fromEntries(SEGMENTS.map((s) => [s, 0]));
    for (const x of list) counts[x.segment]++;
    const seg = c.req.query('segment');
    const rows = (SEGMENTS.includes(seg) ? list.filter((x) => x.segment === seg) : list).slice(0, 200)
      .map(({ id: _id, winback_at: _w, ...x }) => x);
    return c.json({ counts, total: list.length, reachable: list.filter((x) => x.reachable).length, customers: rows });
  });

  app.get('/api/owner/loyalty/messages', owner, async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM loyalty_messages WHERE org_id=? ORDER BY created_at DESC LIMIT 30').bind(c.get('user').org_id).all();
    return c.json({ messages: results });
  });

  app.post('/api/owner/loyalty/messages', owner, async (c) => {
    const u = c.get('user'), b = await body(c);
    const segment = b.segment === 'all' || SEGMENTS.includes(b.segment) ? b.segment : null;
    if (!segment) throw bad('invalid_segment');
    const f = messageFields(b);
    const today = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM loyalty_messages WHERE org_id=? AND segment!='winback' AND created_at>?").bind(u.org_id, now() - DAY).first();
    if (today.n >= MESSAGES_PER_DAY) throw conflict('messages_daily_limit');
    const ids = (await customers(c.env, u.org_id)).filter((x) => segment === 'all' || x.segment === segment).map((x) => x.id);
    if (!ids.length) throw conflict('no_recipients');
    const message = { id: id() };
    await c.env.DB.prepare('INSERT INTO loyalty_messages(id,org_id,segment,title_ar,title_en,body_ar,body_en,created_at) VALUES(?,?,?,?,?,?,?,?)')
      .bind(message.id, u.org_id, segment, f.title_ar, f.title_en, f.body_ar, f.body_en, now()).run();
    const r = await deliver(c.env, message, ids);
    await audit(c.env, u, 'loyalty.message', { segment, recipients: r.recipients });
    return c.json({ id: message.id, ...r }, 201);
  });

  app.post('/api/cards/:token/subscribe', async (c) => {
    const card = await c.env.DB.prepare('SELECT id FROM loyalty_cards WHERE token=? AND revoked_at IS NULL').bind(c.req.param('token')).first();
    if (!card) throw notFound();
    const b = await body(c);
    if (!validEndpoint(b.endpoint)) throw bad('invalid_endpoint');
    const ins = await c.env.DB.prepare('INSERT OR IGNORE INTO card_push(id,card_id,endpoint,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM card_push WHERE card_id=?)<5')
      .bind(id(), card.id, b.endpoint, now(), card.id).run();
    if (!ins.meta.changes) {
      const existing = await c.env.DB.prepare('SELECT id FROM card_push WHERE card_id=? AND endpoint=?').bind(card.id, b.endpoint).first();
      if (!existing) throw new HttpError(429, 'push_device_limit');
    }
    return c.json({ ok: true });
  });
}
