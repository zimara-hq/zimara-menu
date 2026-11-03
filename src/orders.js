// Accepting and rejecting a guest order. Shared by the cashier inbox and the
// Telegram buttons, so both follow the same version check and ticket numbering.
import { conflict, notFound, id, now, randomToken } from './util.js';
import { publish } from './realtime.js';

export const ORDER_TTL = 12 * 3600 * 1000;

export async function acceptOrder(env, { orgId, branchId, orderId, version, invoice = '' }) {
  const order = await env.DB.prepare('SELECT * FROM customer_orders WHERE id=? AND branch_id=?').bind(orderId, branchId).first();
  if (!order) throw notFound();
  if (order.created_at < now() - ORDER_TTL) throw conflict('order_expired');
  if (version === undefined) version = order.version;
  if (order.status !== 'pending' || order.version !== version) throw conflict('stale_order');
  const ticketId = id(), token = randomToken(18), t = now();
  const result = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO tickets(id,org_id,branch_id,number,token,status,created_at,invoice_number) SELECT ?1,?2,?3,CAST(COALESCE((SELECT MAX(CAST(number AS INTEGER)) FROM tickets WHERE branch_id=?3 AND created_at>?4 AND number GLOB '[0-9]*'),0)+1 AS TEXT),?5,'preparing',?6,?7 WHERE EXISTS(SELECT 1 FROM customer_orders WHERE id=?8 AND branch_id=?3 AND status='pending' AND version=?9)`,
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
