// Accepting and rejecting a guest order. Shared by the cashier inbox and the
// Telegram buttons, so both follow the same version check and ticket numbering.
import { conflict, forbidden, notFound, id, now, randomToken } from './util.js';
import { publish } from './realtime.js';
import { staffPermissions } from './staff-permissions.js';

export const ORDER_TTL = 12 * 3600 * 1000;

export async function acceptOrder(env, { orgId, branchId, orderId, version, invoice = '' }) {
  const order = await env.DB.prepare('SELECT q.* FROM customer_orders q JOIN branches b ON b.id=q.branch_id AND b.org_id=q.org_id WHERE q.id=? AND q.branch_id=? AND q.org_id=?').bind(orderId, branchId, orgId).first();
  if (!order) throw notFound();
  if (order.created_at < now() - ORDER_TTL) throw conflict('order_expired');
  if (version === undefined) version = order.version;
  if (order.status !== 'pending' || order.version !== version) throw conflict('stale_order');
  const ticketId = id(), token = randomToken(18), t = now();
  const result = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tickets(id,org_id,branch_id,number,token,status,created_at,invoice_number) SELECT ?1,?2,?3,CAST(COALESCE((SELECT MAX(CAST(number AS INTEGER)) FROM tickets WHERE branch_id=?3 AND (created_at>?4 OR status IN ('preparing','ready')) AND number GLOB '[0-9]*'),0)+1 AS TEXT),?5,'preparing',?6,?7 WHERE EXISTS(SELECT 1 FROM customer_orders WHERE id=?8 AND branch_id=?3 AND status='pending' AND version=?9)`,
    ).bind(ticketId, orgId, branchId, t - ORDER_TTL, token, t, invoice, orderId, version),
    env.DB.prepare(
      "UPDATE customer_orders SET status='accepted',ticket_id=?,version=version+1 WHERE id=? AND branch_id=? AND status='pending' AND version=? AND EXISTS(SELECT 1 FROM tickets WHERE id=?)",
    ).bind(ticketId, orderId, branchId, version, ticketId),
  ]);
  if (!result[0].meta.changes) throw conflict('stale_order');
  const ticket = await env.DB.prepare('SELECT id,number,token FROM tickets WHERE id=?').bind(ticketId).first();
  const updated = await env.DB.prepare('SELECT * FROM customer_orders WHERE id=? AND branch_id=?').bind(orderId, branchId).first();
  await publish(env, branchId, 'order', { id: orderId, status: 'accepted' });
  await publish(env, branchId, 'ticket', { id: ticket.id });
  return { ticket, order: updated };
}

export async function rejectOrder(env, { branchId, orderId, version }) {
  if (version === undefined) {
    const o = await env.DB.prepare('SELECT version FROM customer_orders WHERE id=? AND branch_id=?').bind(orderId, branchId).first();
    if (!o) throw notFound();
    version = o.version;
  }
  const result = await env.DB.prepare(
    "UPDATE customer_orders SET status='rejected',version=version+1 WHERE id=? AND branch_id=? AND status='pending' AND version=?",
  ).bind(orderId, branchId, version).run();
  if (!result.meta.changes) throw conflict('stale_order');
  await publish(env, branchId, 'order', { id: orderId, status: 'rejected' });
}

// A kitchen reads the same pager state the cashier changes. Table demand is
// derived from open guest orders; it is not a claim that a table is occupied.
export async function operationsSnapshot(env, { orgId, branchId }) {
  const branch = await env.DB.prepare('SELECT id FROM branches WHERE id=? AND org_id=?').bind(branchId, orgId).first();
  if (!branch) throw notFound();
  const { results } = await env.DB.prepare(
    `SELECT t.id,t.number,t.status,t.version,t.created_at,t.ready_at,t.invoice_number,
       q.id AS order_id,q.items_json,q.details_json,q.order_type,q.note,q.total
     FROM tickets t LEFT JOIN customer_orders q ON q.ticket_id=t.id AND q.branch_id=t.branch_id AND q.org_id=t.org_id
     WHERE t.branch_id=? AND t.org_id=? AND t.status IN ('preparing','ready') ORDER BY t.created_at,t.id`,
  ).bind(branchId, orgId).all();
  const tickets = results.map(({ items_json, details_json, ...r }) => ({ ...r, items: JSON.parse(items_json || '[]'), details: JSON.parse(details_json || '{}') }));
  const { results: pending } = await env.DB.prepare(
    "SELECT id,details_json,total,created_at FROM customer_orders WHERE org_id=? AND branch_id=? AND order_type='dine_in' AND status='pending' AND created_at>? ORDER BY created_at,id",
  ).bind(orgId, branchId, now() - ORDER_TTL).all();
  const tables = new Map();
  const add = (table, order) => {
    if (!table) return;
    const key = String(table);
    if (!tables.has(key)) tables.set(key, { table: key, orders: [] });
    tables.get(key).orders.push(order);
  };
  for (const t of tickets) if (t.order_type === 'dine_in') add(t.details.table, { id: t.order_id, ticket_id: t.id, number: t.number, status: t.status, total: t.total, created_at: t.created_at });
  for (const q of pending) add(JSON.parse(q.details_json || '{}').table, { id: q.id, status: 'pending', total: q.total, created_at: q.created_at });
  return { tickets, tables: [...tables.values()].sort((a, b) => a.table.localeCompare(b.table, 'en', { numeric: true })), now: now() };
}

export function registerOrders(app, { requireRole }) {
  app.get('/api/branch/orders/operations', requireRole('branch'), async (c) => {
    const u = c.get('user');
    const tableView = c.req.query('view') === 'tables';
    if (!tableView && !(await staffPermissions(c.env, u.branch_id)).tickets_view) throw forbidden('staff_permission_denied');
    const snapshot = await operationsSnapshot(c.env, { orgId: u.org_id, branchId: u.branch_id });
    if (tableView) return c.json({ tables: snapshot.tables, now: snapshot.now });
    return c.json(snapshot);
  });
}
