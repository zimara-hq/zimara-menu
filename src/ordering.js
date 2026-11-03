// Ordering depth: which order types a branch takes (dine-in with a table number,
// pickup, delivery, curbside), WhatsApp ordering, delivery fee and minimum, and
// coupons. The server prices everything; the guest only sends choices.
import { requireRole, body, audit, rateLimit } from './context.js';
import { bad, conflict, notFound, str, int, id, now } from './util.js';

export const ORDER_TYPES = ['dine_in', 'pickup', 'delivery', 'car'];
const DEFAULT = { types: ['pickup'], tables: 0, whatsapp: null, delivery_fee: 0, delivery_min: 0 };
const PHONE = /^(?:\+?966|0)?(5\d{8})$/;
const MAX_COUPONS = 100;

export function normalPhone(v, field = 'phone', optional = false) {
  const raw = str(v, field, { optional, max: 20 });
  if (raw === null) return null;
  const m = raw.replace(/[\s-]/g, '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).match(PHONE);
  if (!m) throw bad('invalid_' + field);
  return '966' + m[1];
}

export async function getOrdering(env, branchId) {
  const r = await env.DB.prepare('SELECT * FROM branch_ordering WHERE branch_id=?').bind(branchId).first();
  if (!r) return { ...DEFAULT };
  return { types: JSON.parse(r.types_json), tables: r.tables, whatsapp: r.whatsapp, delivery_fee: r.delivery_fee, delivery_min: r.delivery_min };
}

// What a guest's menu needs. The WhatsApp number is public by design: the owner
// chose to take orders on it.
export const publicOrdering = (o) => ({ types: o.types, tables: o.tables, whatsapp: o.whatsapp, delivery_fee: o.delivery_fee, delivery_min: o.delivery_min });

function validateOrdering(b, cur) {
  const o = { ...cur };
  if (b.types !== undefined) {
    if (!Array.isArray(b.types) || !b.types.length || b.types.some((t) => !ORDER_TYPES.includes(t))) throw bad('invalid_types');
    o.types = ORDER_TYPES.filter((t) => b.types.includes(t));
  }
  if (b.tables !== undefined) o.tables = int(b.tables, 'tables', { max: 500 });
  if (b.whatsapp !== undefined) o.whatsapp = b.whatsapp === null || b.whatsapp === '' ? null : normalPhone(b.whatsapp, 'whatsapp');
  if (b.delivery_fee !== undefined) o.delivery_fee = int(b.delivery_fee, 'delivery_fee', { max: 100_000 });
  if (b.delivery_min !== undefined) o.delivery_min = int(b.delivery_min, 'delivery_min', { max: 10_000_000 });
  return o;
}

async function ownedBranch(c) {
  const b = await c.env.DB.prepare('SELECT id FROM branches WHERE id=? AND org_id=?').bind(c.req.param('branchId'), c.get('user').org_id).first();
  if (!b) throw notFound();
  return b;
}

function couponView(r) {
  const { org_id, ...rest } = r;
  return { ...rest, active: !!r.active };
}

function couponDiscount(coupon, subtotal, at = now()) {
  if (!coupon || !coupon.active) throw bad('coupon_invalid');
  if ((coupon.starts_at && at < coupon.starts_at) || (coupon.ends_at && at >= coupon.ends_at)) throw bad('coupon_expired');
  if (coupon.max_uses != null && coupon.used >= coupon.max_uses) throw bad('coupon_used_up');
  if (subtotal < coupon.min_total) throw bad('coupon_min_total');
  const d = coupon.kind === 'percent' ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
  return Math.min(d, subtotal);
}

const findCoupon = (env, orgId, code) => env.DB.prepare('SELECT * FROM coupons WHERE org_id=? AND code=?').bind(orgId, String(code).trim().toUpperCase()).first();

// Validates the guest's order choices and returns the priced extras. `statements`
// are run only when the order is actually inserted (not on an idempotent replay).
export async function orderExtras(env, branch, b, subtotal) {
  const o = await getOrdering(env, branch.id);
  const type = b.order_type === undefined ? o.types[0] : b.order_type;
  if (!o.types.includes(type)) throw bad('order_type_unavailable');
  const details = {};
  if (type === 'dine_in') {
    if (o.tables) details.table = String(int(b.table, 'table', { min: 1, max: o.tables }));
    else if (b.table !== undefined && b.table !== null && b.table !== '') details.table = str(String(b.table), 'table', { max: 10 });
  }
  if (type === 'delivery') {
    if (subtotal < o.delivery_min) throw bad('delivery_min_total');
    details.name = str(b.name, 'name', { max: 60 });
    details.phone = normalPhone(b.phone);
    details.address = str(b.address, 'address', { max: 300 });
  } else {
    const name = str(b.name, 'name', { optional: true, max: 60 });
    if (name) details.name = name;
    const phone = normalPhone(b.phone, 'phone', true);
    if (phone) details.phone = phone;
  }
  if (type === 'car') details.car = str(b.car, 'car', { max: 60 });
  let discount = 0, coupon = null;
  if (b.coupon) {
    coupon = await findCoupon(env, branch.org_id, str(b.coupon, 'coupon', { max: 20 }));
    discount = couponDiscount(coupon, subtotal);
  }
  const delivery_fee = type === 'delivery' ? o.delivery_fee : 0;
  return {
    order_type: type, details, discount, delivery_fee, coupon_code: coupon?.code ?? null,
    total: subtotal - discount + delivery_fee,
    statements: coupon ? [env.DB.prepare('UPDATE coupons SET used=used+1 WHERE id=?').bind(coupon.id)] : [],
  };
}

export function registerOrdering(app) {
  const owner = requireRole('owner');
  app.get('/api/owner/branches/:branchId/ordering', owner, async (c) => c.json({ ordering: await getOrdering(c.env, (await ownedBranch(c)).id), types: ORDER_TYPES }));
  app.patch('/api/owner/branches/:branchId/ordering', owner, async (c) => {
    const br = await ownedBranch(c);
    const o = validateOrdering(await body(c), await getOrdering(c.env, br.id));
    await c.env.DB.prepare(
      'INSERT INTO branch_ordering(branch_id,types_json,tables,whatsapp,delivery_fee,delivery_min,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(branch_id) DO UPDATE SET types_json=?2,tables=?3,whatsapp=?4,delivery_fee=?5,delivery_min=?6,updated_at=?7',
    ).bind(br.id, JSON.stringify(o.types), o.tables, o.whatsapp, o.delivery_fee, o.delivery_min, now()).run();
    await audit(c.env, c.get('user'), 'branch.ordering', { branch: br.id });
    return c.json({ ordering: o });
  });

  app.get('/api/owner/coupons', owner, async (c) => {
    const { results } = await c.env.DB.prepare('SELECT * FROM coupons WHERE org_id=? ORDER BY created_at DESC').bind(c.get('user').org_id).all();
    return c.json({ coupons: results.map(couponView) });
  });
  app.post('/api/owner/coupons', owner, async (c) => {
    const u = c.get('user'), b = await body(c);
    const code = str(b.code, 'code', { min: 3, max: 20 }).toUpperCase();
    if (!/^[A-Z0-9ء-ي_-]+$/.test(code)) throw bad('invalid_code');
    if (!['percent', 'amount'].includes(b.kind)) throw bad('invalid_kind');
    const value = int(b.value, 'value', { min: 1, max: b.kind === 'percent' ? 100 : 10_000_000 });
    const starts = int(b.starts_at, 'starts_at', { optional: true, max: 9e15 });
    const ends = int(b.ends_at, 'ends_at', { optional: true, max: 9e15 });
    if (starts && ends && ends <= starts) throw bad('invalid_dates');
    const n = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM coupons WHERE org_id=?').bind(u.org_id).first();
    if (n.n >= MAX_COUPONS) throw conflict('coupons_limit');
    if (await findCoupon(c.env, u.org_id, code)) throw conflict('coupon_exists');
    const row = { id: id(), org_id: u.org_id, code, kind: b.kind, value, min_total: int(b.min_total ?? 0, 'min_total', { max: 10_000_000 }), max_uses: int(b.max_uses, 'max_uses', { optional: true, min: 1, max: 1_000_000 }), used: 0, starts_at: starts, ends_at: ends, active: 1, created_at: now() };
    await c.env.DB.prepare('INSERT INTO coupons(id,org_id,code,kind,value,min_total,max_uses,used,starts_at,ends_at,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(...Object.values(row)).run();
    await audit(c.env, u, 'coupon.create', { code });
    return c.json({ coupon: couponView(row) }, 201);
  });
  app.patch('/api/owner/coupons/:id', owner, async (c) => {
    const b = await body(c);
    if (typeof b.active !== 'boolean') throw bad('invalid_active');
    const r = await c.env.DB.prepare('UPDATE coupons SET active=? WHERE id=? AND org_id=?').bind(b.active ? 1 : 0, c.req.param('id'), c.get('user').org_id).run();
    if (!r.meta.changes) throw notFound();
    return c.json({ ok: true });
  });
  app.delete('/api/owner/coupons/:id', owner, async (c) => {
    const r = await c.env.DB.prepare('DELETE FROM coupons WHERE id=? AND org_id=?').bind(c.req.param('id'), c.get('user').org_id).run();
    if (!r.meta.changes) throw notFound();
    return c.json({ ok: true });
  });

  // Lets the guest see the discount before sending. Rate limited against code guessing.
  app.post('/api/public/coupons/:branchSlug/check', async (c) => {
    const branch = await c.env.DB.prepare('SELECT b.id,b.org_id FROM branches b JOIN orgs o ON o.id=b.org_id WHERE b.slug=? AND b.active=1 AND o.active=1').bind(c.req.param('branchSlug')).first();
    if (!branch) throw notFound();
    await rateLimit(c, 'coupon:' + branch.id, { limit: 20, window: 600000 });
    const b = await body(c);
    const subtotal = int(b.subtotal, 'subtotal', { max: 100_000_000 });
    const coupon = await findCoupon(c.env, branch.org_id, str(b.code, 'code', { max: 20 }));
    return c.json({ code: coupon?.code, discount: couponDiscount(coupon, subtotal) });
  });
}
