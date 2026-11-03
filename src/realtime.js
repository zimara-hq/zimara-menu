// Live updates: one Durable Object per branch holds the open WebSocket connections
// (cashier screens, owner dashboards, phone apps) and fans out small events such as
// "a new order arrived". Events carry no data, only what changed, so every screen
// refetches through the normal permission-checked API. Polling stays as the fallback.
import { requireRole } from './context.js';
import { notFound, HttpError } from './util.js';

export const EVENT_TYPES = ['order', 'ticket', 'waitlist', 'loyalty'];

// Hibernation API: idle sockets cost nothing, and the object wakes for each message.
export class BranchHub {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/publish' && request.method === 'POST') {
      const msg = await request.text();
      let sent = 0;
      for (const ws of this.state.getWebSockets()) {
        try { ws.send(msg); sent++; } catch { /* closing */ }
      }
      return Response.json({ sent });
    }
    if (request.headers.get('upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    if (this.state.getWebSockets().length >= 200) return new Response('too many connections', { status: 429 });
    const pair = new WebSocketPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].send(JSON.stringify({ type: 'hello', at: Date.now() }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, message) {
    if (message === 'ping') ws.send('pong');
  }

  async webSocketClose(ws, code) {
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch { /* already closed */ }
  }
}

// Fire-and-forget: a failed publish never fails the request that caused it.
export async function publish(env, branchId, type, detail = {}) {
  if (!env.HUB || !branchId || !EVENT_TYPES.includes(type)) return false;
  try {
    const stub = env.HUB.get(env.HUB.idFromName(branchId));
    await stub.fetch('https://hub/publish', { method: 'POST', body: JSON.stringify({ type, ...detail, at: Date.now() }) });
    return true;
  } catch {
    return false;
  }
}

export function registerRealtime(app) {
  // Branch accounts join their branch; owners name one of their branches.
  app.get('/api/realtime', requireRole('owner', 'branch'), async (c) => {
    if (!c.env.HUB) throw new HttpError(503, 'realtime_unavailable');
    if (c.req.header('upgrade') !== 'websocket') throw new HttpError(426, 'websocket_required');
    // Only our own pages (or apps, which send no Origin) may open the socket with this session.
    const origin = c.req.header('origin');
    if (origin && origin !== new URL(c.req.url).origin) throw new HttpError(403, 'invalid_origin');
    const u = c.get('user');
    let branchId = u.branch_id;
    if (u.role === 'owner') {
      const b = await c.env.DB.prepare('SELECT id FROM branches WHERE id=? AND org_id=?').bind(c.req.query('branch') || '', u.org_id).first();
      if (!b) throw notFound();
      branchId = b.id;
    }
    const res = await c.env.HUB.get(c.env.HUB.idFromName(branchId)).fetch(c.req.raw);
    // A fresh response so the security-header middleware can still add its headers.
    return res.webSocket ? new Response(null, { status: 101, webSocket: res.webSocket }) : new Response(res.body, res);
  });
}
