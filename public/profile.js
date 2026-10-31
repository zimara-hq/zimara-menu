import { api, esc, lang, makeT, pick, setBrandColor, topbar, applyTenantFont } from './common.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);
const t = makeT({ ar: { title: 'عن المنشأة' }, en: { title: 'About the business' } });
const main = document.getElementById('main');
main.className = 'wrap profile-page';

const icon = (d) => `<svg class="ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  menu: icon('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  pin: icon('<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  clock: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  phone: icon('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>'),
  gift: icon('<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8S9 3 7 5s5 3 5 3 3-5 5-3-5 3-5 3"/>'),
  link: icon('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
};

function openNow(hours) {
  if (!hours?.length) return null;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Riyadh', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(v.weekday);
  const time = v.hour + ':' + v.minute;
  const today = hours.find((h) => h.day === day), previous = hours.find((h) => h.day === (day + 6) % 7);
  if (previous && !previous.closed && previous.open > previous.close && time < previous.close) return true;
  if (!today) return null;
  if (today.closed) return false;
  return today.open < today.close ? time >= today.open && time < today.close : time >= today.open;
}
const statusPill = (hours) => {
  const s = openNow(hours);
  return s === null ? '' : `<span class="status-pill ${s ? 'open' : 'closed'}"><span class="dot" aria-hidden="true"></span>${s ? a('مفتوح الآن', 'Open now') : a('مغلق الآن', 'Closed now')}</span>`;
};

const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
try {
  const { org, profile: p, branches, loyalty } = await api('/api/public/profile/' + encodeURIComponent(slug));
  setBrandColor(org.brand_color);
  const name = pick(org, 'name');
  topbar(document.getElementById('top'), t, { subtitle: name });
  document.title = name + ' · ' + t('brand');
  applyTenantFont(p.font_url);
  document.body.classList.add('profile-body');

  const days = a(['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
  const sectors = { cafe: a('مقهى', 'Café'), restaurant: a('مطعم', 'Restaurant'), clinic: a('عيادة', 'Clinic'), bank: a('بنك', 'Bank'), service: a('مركز خدمة', 'Service centre') };
  const services = ['clinic', 'bank', 'service'].includes(p.sector);
  const sections = p.sections || ['menu', 'branches', 'hours', 'social', 'loyalty'];
  const show = (k) => sections.includes(k);
  const single = branches.length === 1 ? branches[0] : null;
  const withHours = branches.filter((b) => b.settings.hours?.length);
  const links = (p.social_links || []).filter((l) => l?.url);
  const hasContact = p.phone || links.length;
  const hasPlaces = branches.some((b) => b.settings.address || b.settings.maps_url);
  const menuLabel = services ? a('استعرض الخدمات', 'Browse services') : a('افتح المنيو', 'Open the menu');

  const heroActions = [
    show('menu') && branches.length ? `<a class="btn hero-primary" href="${single ? '/m/' + esc(single.slug) : '#branches'}">${ICONS.menu}${menuLabel}</a>` : '',
    show('loyalty') && loyalty ? `<a class="btn hero-secondary" href="/j/${esc(org.slug)}">${ICONS.gift}${a('بطاقة الولاء', 'Loyalty card')}</a>` : '',
  ].join('');

  const hero = `<section class="brand-hero profile-hero" aria-labelledby="org-name">
    ${p.banners?.[0] ? `<img class="profile-cover" src="${esc(p.banners[0].image_url)}" alt="${esc(pick(p.banners[0], 'alt'))}" width="1240" height="440">` : ''}
    <div class="profile-hero-body">
      ${org.logo_url ? `<img class="hero-mark" src="${esc(org.logo_url)}" alt="" width="88" height="88">` : `<span class="hero-mark hero-monogram" aria-hidden="true">${esc([...name][0] || 'Z')}</span>`}
      <div class="profile-hero-text">
        <p class="hero-tags"><span>${esc(sectors[p.sector] || sectors.cafe)}</span>${single ? statusPill(single.settings.hours) : ''}</p>
        <h1 id="org-name">${esc(name)}</h1>
        ${pick(p, 'description') ? `<p class="hero-lead">${esc(pick(p, 'description'))}</p>` : ''}
        ${p.address ? `<p class="hero-address">${ICONS.pin}<span>${esc(p.address)}</span></p>` : ''}
        ${heroActions ? `<div class="hero-actions">${heroActions}</div>` : ''}
      </div>
    </div>
  </section>`;

  const bits = {
    branches: show('branches') && (branches.length > 1 || hasPlaces) ? `<section class="profile-section" id="branches" aria-labelledby="h-branches">
      <h2 id="h-branches">${branches.length > 1 ? a('فروعنا', 'Our branches') : a('موقعنا', 'Find us')}</h2>
      <div class="place-grid">${branches.map((b) => `<article class="place-card">
        <div class="branch-head"><h3>${esc(pick(b, 'name'))}</h3>${statusPill(b.settings.hours)}</div>
        ${b.settings.address ? `<p class="branch-line">${ICONS.pin}<span>${esc(b.settings.address)}</span></p>` : ''}
        <div class="branch-actions"><a class="btn sm" href="/m/${esc(b.slug)}">${menuLabel}</a>${b.settings.maps_url ? `<a class="btn ghost sm" href="${esc(b.settings.maps_url)}" target="_blank" rel="noopener">${a('الاتجاهات', 'Directions')}</a>` : ''}</div>
      </article>`).join('')}</div>
    </section>` : '',
    hours: show('hours') && withHours.length ? `<section class="profile-section" aria-labelledby="h-hours">
      <h2 id="h-hours">${a('أوقات العمل', 'Opening hours')}</h2>
      <div class="place-grid">${withHours.map((b) => `<div class="hours-card">
        ${branches.length > 1 ? `<h3>${esc(pick(b, 'name'))}</h3>` : ''}
        <dl class="opening-hours">${b.settings.hours.map((h) => `<div><dt>${esc(days[h.day])}</dt><dd>${h.closed ? a('مغلق', 'Closed') : `<bdi>${esc(h.open)} – ${esc(h.close)}</bdi>`}</dd></div>`).join('')}</dl>
        <p class="small muted">${ICONS.clock} ${a('بتوقيت الرياض', 'Riyadh time')}</p>
      </div>`).join('')}</div>
    </section>` : '',
    social: show('social') && hasContact ? `<section class="profile-section" aria-labelledby="h-contact">
      <h2 id="h-contact">${a('تواصل معنا', 'Contact us')}</h2>
      <div class="contact-row">${p.phone ? `<a class="contact-chip" href="tel:${esc(p.phone.replace(/[^+\d]/g, ''))}">${ICONS.phone}<bdi>${esc(p.phone)}</bdi></a>` : ''}${links.map((l) => `<a class="contact-chip" href="${esc(l.url)}" target="_blank" rel="noopener">${ICONS.link}<span>${esc(l.label)}</span></a>`).join('')}</div>
    </section>` : '',
    loyalty: show('loyalty') && loyalty ? `<section class="loyalty-band" aria-labelledby="h-loyalty">
      <div>
        <h2 id="h-loyalty">${a('كل زيارة تقربك من مكافأتك', 'Every visit brings a reward closer')}</h2>
        <p>${a(`اجمع ${loyalty.stamps_required} أختام واحصل على ${esc(loyalty.reward_ar)}.`, `Collect ${loyalty.stamps_required} stamps and get ${esc(loyalty.reward_en)}.`)}</p>
        <a class="btn" href="/j/${esc(org.slug)}">${ICONS.gift}${a('احصل على بطاقتك', 'Get your card')}</a>
      </div>
      <ol class="stamp-dots" aria-hidden="true">${Array.from({ length: Math.min(loyalty.stamps_required, 10) }, (_, i) => `<li class="${i < 2 ? 'on' : ''}"></li>`).join('')}</ol>
    </section>` : '',
  };
  const info = sections.filter((k) => k !== 'loyalty').map((k) => bits[k] || '').join('');
  main.innerHTML = hero + (info ? `<div class="profile-info">${info}</div>` : '') + bits.loyalty;
} catch {
  topbar(document.getElementById('top'), t);
  main.innerHTML = `<div class="card"><h1>${a('الصفحة غير متاحة', 'Page unavailable')}</h1><p class="muted">${a('تأكد من رابط المنشأة وحاول مجددًا.', 'Check the business link and try again.')}</p><a class="btn ghost" href="/">${a('زيمارا منيو', 'ZIMARA Menu')}</a></div>`;
}
