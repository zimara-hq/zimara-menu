// Visitor side of the add-on store: announcement bar, WhatsApp button, FAQ and ad pixels.
// Pixels load only after the visitor agrees, and only from the vendor hosts the CSP allows.
import { esc, lang, pick } from './common.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);

const load = (src) => {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.append(s);
};

const PIXELS = {
  meta(id) {
    const f = (window.fbq = window.fbq || function () { f.callMethod ? f.callMethod.apply(f, arguments) : f.queue.push(arguments); });
    if (!window._fbq) window._fbq = f;
    f.push = f; f.loaded = true; f.version = '2.0'; f.queue = f.queue || [];
    load('https://connect.facebook.net/en_US/fbevents.js');
    f('init', id); f('track', 'PageView');
    return (v) => f('track', 'Purchase', { value: v, currency: 'SAR' });
  },
  ga4(id) { return gtag(id); },
  gads(id) { return gtag(id); },
  tiktok(id) {
    const q = (window.ttq = window.ttq || []);
    q.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
    q.setAndDefer = (t, e) => { t[e] = function () { t.push([e].concat([].slice.call(arguments, 0))); }; };
    q.methods.forEach((m) => q.setAndDefer(q, m));
    q.instance = (t) => { const e = q._i[t] || []; q.methods.forEach((m) => q.setAndDefer(e, m)); return e; };
    q._i = q._i || {}; q._i[id] = []; q._i[id]._u = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    q._t = q._t || {}; q._t[id] = +new Date(); q._o = q._o || {}; q._o[id] = {};
    load(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`);
    q.page();
    return (v) => q.track('CompletePayment', { value: v, currency: 'SAR' });
  },
  snap(id) {
    const s = (window.snaptr = window.snaptr || function () { s.handleRequest ? s.handleRequest.apply(s, arguments) : s.queue.push(arguments); });
    s.queue = s.queue || [];
    load('https://sc-static.net/scevent.min.js');
    s('init', id); s('track', 'PAGE_VIEW');
    return (v) => s('track', 'PURCHASE', { price: v, currency: 'SAR' });
  },
  x(id) {
    const t = (window.twq = window.twq || function () { t.exe ? t.exe.apply(t, arguments) : t.queue.push(arguments); });
    t.version = '1.1'; t.queue = t.queue || [];
    load('https://static.ads-twitter.com/uwt.js');
    t('config', id);
    return null;
  },
  pinterest(id) {
    const p = (window.pintrk = window.pintrk || function () { p.queue.push(Array.prototype.slice.call(arguments)); });
    p.queue = p.queue || []; p.version = '3.0';
    load('https://s.pinimg.com/ct/core.js');
    p('load', id); p('page');
    return (v) => p('track', 'checkout', { value: v, currency: 'SAR' });
  },
  linkedin(id) {
    window._linkedin_data_partner_ids = [...(window._linkedin_data_partner_ids || []), id];
    const l = (window.lintrk = window.lintrk || function (x, y) { l.q.push([x, y]); });
    l.q = l.q || [];
    load('https://snap.licdn.com/li.lms-analytics/insight.min.js');
    return null;
  },
};

let gtagLoaded = false;
function gtag(id) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  if (!gtagLoaded) { load('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id)); window.gtag('js', new Date()); gtagLoaded = true; }
  window.gtag('config', id);
  return id.startsWith('G-') ? (v) => window.gtag('event', 'purchase', { value: v, currency: 'SAR' }) : null;
}

const purchaseHooks = [];
// Called by the menu after an order is sent. Value is in halalas.
export function trackPurchase(halalas) {
  for (const fn of purchaseHooks) try { fn(halalas / 100); } catch { /* a vendor script must never break ordering */ }
}

function startPixels(pixels) {
  for (const [k, v] of Object.entries(pixels)) {
    if (!PIXELS[k] || !v) continue;
    try { const hook = PIXELS[k](v); if (hook) purchaseHooks.push(hook); } catch { /* ignore vendor errors */ }
  }
}

function consent(orgSlug, pixels) {
  if (!Object.keys(pixels || {}).length) return;
  const key = 'zm_pixels_' + orgSlug;
  let choice = null;
  try { choice = localStorage.getItem(key); } catch { /* private mode */ }
  if (choice === 'yes') return startPixels(pixels);
  if (choice === 'no') return;
  const bar = document.createElement('div');
  bar.className = 'consent-bar';
  bar.setAttribute('role', 'dialog');
  bar.setAttribute('aria-label', a('أدوات القياس', 'Measurement tools'));
  bar.innerHTML = `<p>${a('تستخدم هذه المنشأة أدوات قياس إعلانية لتحسين عروضها. توافق؟', 'This business uses ad measurement tools to improve its offers. Do you agree?')} <a href="/legal?section=privacy" target="_blank" rel="noopener">${a('الخصوصية', 'Privacy')}</a></p><div><button type="button" class="btn sm" data-c="yes">${a('موافق', 'Agree')}</button><button type="button" class="btn ghost sm" data-c="no">${a('لا، شكرًا', 'No thanks')}</button></div>`;
  bar.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]')?.dataset.c;
    if (!c) return;
    try { localStorage.setItem(key, c); } catch { /* ignore */ }
    bar.remove();
    if (c === 'yes') startPixels(pixels);
  });
  document.body.append(bar);
}

const WA = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4a.5.5 0 0 0 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3z"/></svg>';

// Renders the visitor-facing add-ons around a page's main element.
export function renderAddons(addons, { main, orgSlug }) {
  if (!addons) return;
  const n = addons.announcement;
  if (n && pick(n, 'text')) {
    const bar = document.createElement(n.href ? 'a' : 'div');
    bar.className = 'announce-bar tone-' + (n.tone || 'brand');
    if (n.href) { bar.href = n.href; bar.target = '_blank'; bar.rel = 'noopener'; }
    bar.textContent = pick(n, 'text');
    main.before(bar);
  }
  const f = addons.faq;
  if (f?.items?.length) {
    const sec = document.createElement('section');
    sec.className = 'card faq-block';
    sec.innerHTML = `<h2>${a('الأسئلة الشائعة', 'Frequently asked')}</h2>${f.items.map((x) => `<details><summary>${esc(pick(x, 'q'))}</summary><p>${esc(pick(x, 'a'))}</p></details>`).join('')}`;
    const anchor = main.querySelector('.menu-more');
    anchor ? anchor.before(sec) : main.append(sec);
  }
  const w = addons.whatsapp_button;
  if (w?.phone) {
    const link = document.createElement('a');
    link.className = 'wa-float';
    const msg = pick(w, 'message');
    link.href = `https://wa.me/${w.phone}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', a('راسلنا على واتساب', 'Message us on WhatsApp'));
    link.innerHTML = WA;
    document.body.append(link);
  }
  // Private studio previews receive draft content from their parent. Keep
  // third-party tracking scripts out even when a visitor previously consented.
  if(!['design_preview','season_preview'].some(key=>new URLSearchParams(location.search).has(key)))consent(orgSlug, addons.pixels);
}
