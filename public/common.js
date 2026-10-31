// Shared helpers for every ZIMARA Menu page: language, theme, API, money, QR, sound.
const DICT = {
  ar: {
    brand: 'زيمارا منيو', lang: 'English', theme: 'الوضع', logout: 'خروج', loading: 'جارٍ التحميل…',
    sar: 'ر.س', retry: 'إعادة المحاولة', save: 'حفظ', saved: 'تم الحفظ', cancel: 'إلغاء', add: 'إضافة', edit: 'تعديل',
    error: 'صار خطأ، حاول مرة ثانية', offline: 'الاتصال مقطوع، نحاول نرجع…',
  },
  en: {
    brand: 'ZIMARA Menu', lang: 'العربية', theme: 'Theme', logout: 'Log out', loading: 'Loading…',
    sar: 'SAR', retry: 'Retry', save: 'Save', saved: 'Saved', cancel: 'Cancel', add: 'Add', edit: 'Edit',
    error: 'Something went wrong, try again', offline: 'Connection lost, reconnecting…',
  },
};

export function getLang() {
  const q = new URLSearchParams(location.search).get('lang');
  if (q === 'ar' || q === 'en') return q;
  try { return localStorage.getItem('zm_lang') === 'en' ? 'en' : 'ar'; } catch { return 'ar'; }
}

export let lang = getLang();

export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function toggleLang() {
  lang = lang === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem('zm_lang', lang); } catch {}
  const url = new URL(location.href);
  url.searchParams.set('lang', lang);
  location.assign(url);
}

export function makeT(dict) {
  return (key, vars = {}) => {
    const s = (dict[lang] && dict[lang][key]) ?? DICT[lang][key] ?? dict.en?.[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  };
}

export function applyTheme() {
  try {
    const t = localStorage.getItem('zm_theme');
    if (t) document.documentElement.dataset.theme = t;
  } catch {}
}

let tenantColor = null;

export function toggleTheme() {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('zm_theme', next); } catch {}
  if (tenantColor) setBrandColor(tenantColor);
}

export const pick = (o, base) => (lang === 'ar' ? o[base + '_ar'] : o[base + '_en']) || o[base + '_ar'] || o[base + '_en'] || '';

export function money(halalas) {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-SA', { style: 'currency', currency: 'SAR' }).format(halalas / 100);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || 'http_' + status);
    this.status = status;
    this.data = data;
  }
}

export async function api(path, { method = 'GET', body, timeout = 12000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export function qrSvg(text, cell = 6) {
  const q = window.qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}

// A loud-ish two-tone chime made in WebAudio, so no audio asset is needed.
let audioCtx = null;
export function unlockAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return true;
  } catch {
    return false;
  }
}

export function chime(times = 3) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  for (let i = 0; i < times; i++) {
    for (const [f, dt] of [[880, 0], [1320, 0.18]]) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'square';
      o.frequency.value = f;
      const s = t0 + i * 0.7 + dt;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.4, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.16);
      o.connect(g).connect(audioCtx.destination);
      o.start(s);
      o.stop(s + 0.18);
    }
  }
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
}

export function topbar(el, t, { extra = '', subtitle = '' } = {}) {
  el.innerHTML = `
    <a class="brandmark" href="/"><img src="/brand/symbol.webp" alt="" width="40" height="40"><span>${esc(t('brand'))}${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span></a>
    <div class="tools">${extra}
      <button class="btn ghost sm" data-act="lang" type="button">${esc(t('lang'))}</button>
      <button class="btn ghost sm" data-act="theme" type="button" aria-label="${esc(t('theme'))}">◐</button>
    </div>`;
  el.querySelector('[data-act=lang]').onclick = toggleLang;
  el.querySelector('[data-act=theme]').onclick = toggleTheme;
}

export function setBrandColor(hex) {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return;
  tenantColor = hex;
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = rgb.map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement.style;
  root.setProperty('--brand', hex);
  root.setProperty('--accent', hex);
  root.setProperty('--on-accent', luminance > .179 ? '#000000' : '#ffffff');
  root.setProperty('--accent-ink', dark ? (luminance < .25 ? '#bcacce' : hex) : (luminance > .16 ? '#23003f' : hex));
}

export function relTime(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return lang === 'ar' ? `${m} د` : `${m} m`;
}

applyLang();
applyTheme();


export function announce(message, danger = false) {
  let node = document.getElementById('global-notice');
  if (!node) {
    node = document.createElement('div');
    node.id = 'global-notice';
    node.className = 'global-notice';
    node.setAttribute('role', 'status');
    document.body.append(node);
  }
  node.classList.toggle('error', danger);
  node.textContent = message;
  node.hidden = false;
  clearTimeout(announce.timer);
  announce.timer = setTimeout(() => { node.hidden = true; }, 6000);
}

// A focused, app-owned dialog; Escape/cancel never commits a change.
export function requestValue({ title, label, type = 'text', confirmLabel, hint = '' }) {
  return new Promise((resolve) => {
    const previous = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog';
    dialog.innerHTML = `<form method="dialog" class="stack" novalidate><h2 id="dialog-title">${esc(title)}</h2><p class="muted">${esc(hint)}</p><label for="dialog-value">${esc(label)}</label><input id="dialog-value" type="${esc(type)}" autocomplete="${type === 'password' ? 'new-password' : 'off'}"><div class="row"><button class="btn ghost" value="cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button><button class="btn" value="commit">${esc(confirmLabel || (lang === 'ar' ? 'حفظ' : 'Save'))}</button></div></form>`;
    dialog.setAttribute('aria-labelledby', 'dialog-title');
    document.body.append(dialog);
    dialog.addEventListener('close', () => {
      const result = dialog.returnValue === 'commit' ? dialog.querySelector('input').value : null;
      dialog.remove();
      previous?.focus();
      resolve(result);
    }, { once: true });
    dialog.showModal();
    dialog.querySelector('button[value="cancel"]').focus();
  });
}


export function applyTenantFont(path) {
  if (!path || !/^\/api\/assets\/[a-z0-9-]{36}$/.test(path)) return;
  let style = document.getElementById('tenant-font-rule');
  if (!style) { style=document.createElement('style');style.id='tenant-font-rule';document.head.append(style); }
  style.textContent = `@font-face{font-family:TenantFont;src:url("${path}");font-display:swap}body{font-family:TenantFont,var(--font)}`;
}
