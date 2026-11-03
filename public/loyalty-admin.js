// Owner loyalty: stamps or points, the join QR, guest segments, messages to card
// holders, and the automatic win-back message.
import { api, esc, lang, qrSvg, announce, money, relTime } from './common.js';
const a = (ar, en) => (lang === 'ar' ? ar : en);

const SEG = {
  vip: ['⭐ المميزون', '⭐ VIP', '6 زيارات أو أكثر خلال 60 يوم', '6+ visits in 60 days'],
  regular: ['🙂 الدائمون', '🙂 Regulars', 'يزورونك باستمرار', 'Visit you steadily'],
  new: ['🌱 الجدد', '🌱 New', 'زيارة وحدة', 'One visit so far'],
  at_risk: ['⚠️ على وشك الانقطاع', '⚠️ At risk', 'غابوا 21 يوم أو أكثر', 'Away 21+ days'],
  dormant: ['💤 الخاملون', '💤 Dormant', 'غابوا 60 يوم أو أكثر', 'Away 60+ days'],
};
const ERR = {
  messages_daily_limit: ['وصلت الحد: رسالتين باليوم عشان ما تزعج عملاءك.', 'Limit reached: two messages a day, so guests are not spammed.'],
  no_recipients: ['ما فيه عملاء في هذي الشريحة الحين.', 'No guests in this segment right now.'],
  invalid_winback_days: ['أقل مدة للغياب 7 أيام.', 'The shortest absence is 7 days.'],
  winback_message_required: ['اكتب رسالة الاشتياق.', 'Write the win-back message.'],
};
const errText = (e, fallback) => (ERR[e?.data?.error] ? a(...ERR[e.data.error]) : fallback);

export async function loyaltyAdmin(el, me) {
  const [{ program: p }, cust, { messages }] = await Promise.all([api('/api/owner/loyalty'), api('/api/owner/loyalty/customers'), api('/api/owner/loyalty/messages')]);
  const kind = p.kind || 'stamps';
  const joinUrl = `${location.origin}/j/${me.org.slug}`;
  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a('الولاء', 'LOYALTY')}</span><h2>${a('عملاء يرجعون لك.', 'Guests who come back.')}</h2><p>${a('أختام أو نقاط في بطاقة على جوال العميل، وشرائح تعرف منها مين غاب، ورسائل توصل لهم على الجوال.', 'Stamps or points on the guest’s phone, segments that show who drifted away, and messages that reach their phone.')}</p></div>
    <div class="overview-grid">
    <form novalidate class="card stack" id="lp-form"><h3>${a('البرنامج', 'Programme')}</h3>
      <div class="order-types" role="radiogroup" aria-label="${a('نوع البرنامج', 'Programme type')}">
        <button type="button" role="radio" data-kind="stamps" aria-checked="${kind === 'stamps'}">☕ ${a('أختام', 'Stamps')}</button>
        <button type="button" role="radio" data-kind="points" aria-checked="${kind === 'points'}">💎 ${a('نقاط', 'Points')}</button></div>
      <div data-for="stamps"><label>${a('عدد الأختام للمكافأة', 'Stamps for a reward')}<input name="stamps_required" type="number" min="2" max="50" inputmode="numeric" value="${p.stamps_required}"></label></div>
      <div data-for="points" class="grid2"><label>${a('نقاط لكل ريال', 'Points per riyal')}<input name="points_per_sar" type="number" min="1" max="100" inputmode="numeric" value="${p.points_per_sar || 1}"></label>
        <label>${a('نقاط المكافأة', 'Points for a reward')}<input name="reward_points" type="number" min="10" max="100000" inputmode="numeric" value="${p.reward_points || 100}"></label></div>
      <div class="grid2"><label>${a('المكافأة (عربي)', 'Reward (Arabic)')}<input name="reward_ar" maxlength="80" value="${esc(p.reward_ar)}"></label><label>${a('المكافأة (إنجليزي)', 'Reward (English)')}<input name="reward_en" maxlength="80" value="${esc(p.reward_en)}"></label></div>
      <p class="small muted" data-for="points">${a('مع النقاط يكتب الكاشير مبلغ الفاتورة، والنظام يحسب النقاط.', 'With points the cashier types the bill amount and the system works out the points.')}</p>
      <label class="check"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}> ${a('البرنامج مفعّل', 'Programme on')}</label>
      <fieldset class="opt-group"><legend>${a('رسالة الاشتياق التلقائية', 'Automatic win-back')}</legend>
        <label>${a('أرسلها لمن غاب (يوم، 0 = إيقاف)', 'Send to guests away (days, 0 = off)')}<input name="winback_days" type="number" min="0" max="365" inputmode="numeric" value="${p.winback_days || 0}"></label>
        <label>${a('الرسالة', 'Message')}<textarea name="winback_ar" maxlength="160" rows="2" placeholder="${a('وحشتنا! ختمك القادم مضاعف هالأسبوع', 'We miss you! Double stamps this week')}">${esc(p.winback_ar || '')}</textarea></label>
        <p class="small muted">${a('تنرسل مرة وحدة لكل غياب، في النهار فقط.', 'Sent once per absence, in daytime only.')}</p></fieldset>
      <div role="status"></div><button class="btn" type="submit">${a('حفظ', 'Save')}</button></form>
    <div class="card share-card"><h3>${a('كود الاشتراك', 'Join QR')}</h3><div class="qr">${qrSvg(joinUrl, 5)}</div><p class="device-link"><a href="/j/${esc(me.org.slug)}" target="_blank" rel="noopener" dir="ltr">${esc(location.host)}/j/${esc(me.org.slug)}</a></p><p class="small muted">${a('اطبعه عند الكاشير. يظهر أيضًا في صفحة البيجر وقائمة الانتظار.', 'Print it at the counter. It also shows on the pager and waitlist pages.')}</p></div>
    </div>
    <section class="card"><div class="row" style="justify-content:space-between"><h3>${a('شرائح العملاء', 'Guest segments')}</h3><span class="small muted">${a(`${cust.total} بطاقة · ${cust.reachable} تستقبل الإشعارات`, `${cust.total} cards · ${cust.reachable} get notifications`)}</span></div>
      <div class="seg-grid">${Object.entries(SEG).map(([k, [ar, en, dar, den]]) => `<button type="button" class="seg" data-seg="${k}" aria-pressed="false"><strong>${cust.counts[k]}</strong><span>${a(ar, en)}</span><small>${a(dar, den)}</small></button>`).join('')}</div>
      <div id="seg-list"></div></section>
    <form class="card stack" id="msg-form" novalidate><h3>${a('أرسل رسالة', 'Send a message')}</h3>
      <label>${a('إلى', 'To')}<select name="segment"><option value="all">${a('كل حاملي البطاقة', 'All card holders')} (${cust.total})</option>${Object.entries(SEG).map(([k, [ar, en]]) => `<option value="${k}">${a(ar, en)} (${cust.counts[k]})</option>`).join('')}</select></label>
      <label>${a('العنوان', 'Title')}<input name="title_ar" maxlength="60" placeholder="${a('عرض نهاية الأسبوع', 'Weekend offer')}"></label>
      <label>${a('النص', 'Text')}<textarea name="body_ar" maxlength="240" rows="3" placeholder="${a('خصم 20٪ على المشروبات الباردة لين الأحد', '20% off cold drinks until Sunday')}"></textarea></label>
      <p class="small muted">${a('توصل كإشعار لمن فعّل التنبيهات، وتظهر في بطاقة كل عميل. رسالتين باليوم كحد أقصى.', 'Arrives as a notification for guests who turned alerts on, and shows on every card. Two a day at most.')}</p>
      <div role="status"></div><button class="btn" type="submit">${a('أرسل', 'Send')}</button></form>
    <section class="card"><h3>${a('الرسائل المرسلة', 'Sent messages')}</h3>${messages.length ? `<div class="table-scroll"><table><thead><tr><th>${a('الرسالة', 'Message')}</th><th>${a('إلى', 'To')}</th><th>${a('وصلت', 'Delivered')}</th><th>${a('متى', 'When')}</th></tr></thead><tbody>${messages.map((m) => `<tr><td><b>${esc(m.title_ar)}</b><br><span class="small">${esc(m.body_ar)}</span></td><td>${m.segment === 'winback' ? a('تلقائي: اشتياق', 'Auto: win-back') : m.segment === 'all' ? a('الكل', 'All') : esc(a(SEG[m.segment][0], SEG[m.segment][1]))}</td><td>${m.recipients} · 📳 ${m.sent}</td><td class="small">${esc(relTime(Date.now() - m.created_at))}</td></tr>`).join('')}</tbody></table></div>` : `<p class="empty">${a('ما أرسلت رسائل بعد.', 'No messages yet.')}</p>`}</section>`;

  const f = el.querySelector('#lp-form');
  let k = kind;
  const showKind = () => {
    f.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.kind === k)));
    f.querySelectorAll('[data-for]').forEach((x) => (x.hidden = x.dataset.for !== k));
  };
  f.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { k = b.dataset.kind; showKind(); }));
  showKind();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const msg = f.querySelector('[role=status]');
    try {
      await api('/api/owner/loyalty', { method: 'PUT', body: { kind: k, stamps_required: Number(f.stamps_required.value), points_per_sar: Number(f.points_per_sar.value), reward_points: Number(f.reward_points.value), reward_ar: f.reward_ar.value.trim(), reward_en: f.reward_en.value.trim() || f.reward_ar.value.trim(), active: f.active.checked, winback_days: Number(f.winback_days.value || 0), winback_ar: f.winback_ar.value.trim() || null } });
      msg.innerHTML = `<p class="msg">${a('تم الحفظ ✓', 'Saved ✓')}</p>`;
      announce(a('تم حفظ برنامج الولاء.', 'Loyalty programme saved.'));
    } catch (err) { msg.innerHTML = `<p class="msg error">${esc(errText(err, a('راجع الخانات.', 'Check the fields.')))}</p>`; }
  };

  const list = el.querySelector('#seg-list');
  el.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = async () => {
    el.querySelectorAll('[data-seg]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const r = await api('/api/owner/loyalty/customers?segment=' + b.dataset.seg);
    const unit = k === 'points' ? a('نقطة', 'pts') : a('ختم', 'stamps');
    list.innerHTML = r.customers.length ? `<div class="table-scroll"><table><thead><tr><th>${a('البطاقة', 'Card')}</th><th>${a('الزيارات', 'Visits')}</th><th>${a('آخر زيارة', 'Last visit')}</th><th>${a('الرصيد', 'Balance')}</th>${k === 'points' ? `<th>${a('الإنفاق', 'Spent')}</th>` : ''}<th>📳</th></tr></thead><tbody>${r.customers.map((c) => `<tr><td dir="ltr"><code>${esc(c.code)}</code></td><td>${c.visits}</td><td>${c.last_visit ? esc(relTime(Date.now() - c.last_visit)) : '—'}</td><td>${c.balance} ${unit}</td>${k === 'points' ? `<td>${esc(money(c.spent))}</td>` : ''}<td>${c.reachable ? '✓' : ''}</td></tr>`).join('')}</tbody></table></div>` : `<p class="empty">${a('ما فيه أحد هنا.', 'Nobody here.')}</p>`;
    const sel = el.querySelector('#msg-form [name=segment]');
    sel.value = b.dataset.seg;
  }));

  const m = el.querySelector('#msg-form');
  m.onsubmit = async (e) => {
    e.preventDefault();
    const msg = m.querySelector('[role=status]');
    if (!m.title_ar.value.trim() || !m.body_ar.value.trim()) { msg.innerHTML = `<p class="msg error">${a('اكتب العنوان والنص.', 'Write the title and text.')}</p>`; return; }
    const btn = m.querySelector('[type=submit]'); btn.disabled = true;
    try {
      const r = await api('/api/owner/loyalty/messages', { method: 'POST', body: { segment: m.segment.value, title_ar: m.title_ar.value.trim(), body_ar: m.body_ar.value.trim() } });
      announce(a(`وصلت ${r.recipients} بطاقة، و${r.sent} إشعار.`, `Reached ${r.recipients} cards and ${r.sent} phones.`));
      await loyaltyAdmin(el, me);
    } catch (err) { msg.innerHTML = `<p class="msg error">${esc(errText(err, a('تعذر الإرسال.', 'Could not send.')))}</p>`; btn.disabled = false; }
  };
}
