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
  try { return localStorage.getItem('zm_lang') || 'ar'; } catch { return 'ar'; }
}

export let lang = getLang();

export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function toggleLang() {
  lang = lang === 'ar' ? 'en' : 'ar';
  try { localStorage.setItem('zm_lang', lang); } catch {}
  location.reload();
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

export function toggleTheme() {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('zm_theme', next); } catch {}
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
    <a class="brandmark" href="/"><img src="/brand/symbol.webp" alt="" width="34" height="34"><span>${esc(t('brand'))}${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</span></a>
    <div class="tools">${extra}
      <button class="btn ghost sm" data-act="lang" type="button">${esc(t('lang'))}</button>
      <button class="btn ghost sm" data-act="theme" type="button" aria-label="${esc(t('theme'))}">◐</button>
    </div>`;
  el.querySelector('[data-act=lang]').onclick = toggleLang;
  el.querySelector('[data-act=theme]').onclick = toggleTheme;
}

export function setBrandColor(hex) {
  if (hex && /^#[0-9a-f]{6}$/i.test(hex)) document.documentElement.style.setProperty('--brand', hex);
}

export function relTime(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  return lang === 'ar' ? `${m} د` : `${m} m`;
}

applyLang();
applyTheme();
