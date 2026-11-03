// Live updates for staff screens: one WebSocket per page to this branch's hub.
// Messages only say what changed; each screen refetches through the normal API.
// If the socket is down, the screens' regular polling keeps everything correct.
let started = false, retry = 0, ping = null;

function connect(path) {
  let ws;
  try { ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + path); } catch { return; }
  ws.onopen = () => { retry = 0; clearInterval(ping); ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 30000); };
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    try { const d = JSON.parse(e.data); if (d.type && d.type !== 'hello') dispatchEvent(new CustomEvent('zm-live', { detail: d })); } catch { /* ignore */ }
  };
  ws.onclose = () => {
    clearInterval(ping);
    if (retry < 20) setTimeout(() => connect(path), Math.min(30000, 1000 * 2 ** retry++));
  };
}

export function startLive(path = '/api/realtime') {
  if (started || !('WebSocket' in window)) return;
  started = true;
  connect(path);
}

// Calls fn for matching events while `marker` (a node of the open screen) is on the page.
export function onLive(marker, types, fn) {
  if (!marker) return;
  const h = (e) => {
    if (!marker.isConnected) { removeEventListener('zm-live', h); return; }
    if (types.includes(e.detail.type)) fn(e.detail);
  };
  addEventListener('zm-live', h);
}
