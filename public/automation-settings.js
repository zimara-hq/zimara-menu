import { api, esc, lang, announce } from './common.js';
const a = (ar, en) => lang === 'ar' ? ar : en;
const statusLabel = (status) => ({ disabled: a('متوقفة','Disabled'), needs_configuration: a('تحتاج إلى إعداد','Needs configuration'), configured_unverified: a('مُعدة — لم تُتحقق بعد','Configured · unverified'), pending: a('في الانتظار','Pending'), delivering: a('قيد الإرسال','Delivering'), delivered: a('تم التسليم','Delivered'), failed: a('تعذر التسليم','Failed') })[status] || status;
export async function automationSettings(el) {
  const data = await api('/api/admin/automation');
  el.innerHTML = `<div class="section-intro"><h2>${a('أتمتة التشغيل','Operations automation')}</h2><p>${a('أحداث حالة الطلب الموقعة تُرسل إلى سير العمل المُعد من المشغل.','Signed ticket status events go to the workflow configured by the operator.')}</p></div><section class="card stack"><p>${a('الحالة','Status')}: <strong>${esc(statusLabel(data.state))}</strong></p><p class="small muted">${a('تهيئة الاتصال لا تثبت تفعيل سير العمل الخارجي. لا تتضمن الأحداث أسماء العملاء أو رموز الاستلام.','Configuration does not verify an active external workflow. Events exclude customer names and collection tokens.')}</p><div role="status" id="automation-message"></div>${data.deliveries.length ? `<div class="table-wrap"><table><thead><tr><th>${a('الحدث','Event')}</th><th>${a('الحالة','Status')}</th><th>${a('المحاولات','Attempts')}</th><th>${a('الإجراء','Action')}</th></tr></thead><tbody>${data.deliveries.map(row => `<tr><td><code>${esc(row.id)}</code></td><td>${esc(statusLabel(row.status))}${row.last_status ? ` (${esc(row.last_status)})` : ''}</td><td>${esc(row.attempts)} / ${data.max_attempts}</td><td>${row.status === 'failed' && data.configured ? `<button class="btn secondary" data-retry="${esc(row.id)}">${a('إعادة المحاولة','Retry')}</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<p>${a('لم تُسجل أحداث بعد.','No events recorded yet.')}</p>`}</section>`;
  for (const button of el.querySelectorAll('[data-retry]')) button.onclick = async () => {
    button.disabled = true;
    try {
      await api(`/api/admin/automation/${encodeURIComponent(button.dataset.retry)}/retry`, { method: 'POST', body: {} });
      await automationSettings(el);
      announce(a('أُضيفت إعادة المحاولة إلى قائمة الانتظار.','Retry queued.'));
    } catch {
      const msg = el.querySelector('#automation-message');
      if (msg) msg.textContent = a('تعذرت إعادة المحاولة. حدّث الصفحة وحاول مجددًا.','Could not queue retry. Refresh and try again.');
      button.disabled = false;
    }
  };
}
