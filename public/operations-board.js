import { api, esc, lang, money, pick, relTime, announce } from './common.js';
import { onLive } from './realtime.js';
const a = (ar, en) => lang === 'ar' ? ar : en;
const status = (s) => ({ pending: a('بانتظار القبول', 'Awaiting acceptance'), preparing: a('قيد التحضير', 'Preparing'), ready: a('جاهز', 'Ready') })[s] || s;

export async function operationsBoard(el, mode = 'kitchen') {
  const tables = mode === 'tables';
  const { permissions = {} } = await api('/api/me');
  let busy = false, acting = false, timer;
  el.innerHTML = `<div class="section-intro"><h2>${tables ? a('طلبات الطاولات', 'Table orders') : a('شاشة المطبخ', 'Kitchen display')}</h2><p>${tables ? a('طلبات محلية بانتظار القبول أو لها نداء مفتوح. هذه ليست حالة إشغال الطاولة أو الدفع.', 'Dine-in orders awaiting acceptance or with an open pager. This does not track table occupancy or payment.') : a('نفس حالة النداء عند الكاشير، مع تفاصيل الأصناف والملاحظات. تتحدث كل 5 ثوانٍ.', 'Live cashier pager state with items and notes. Refreshes every 5 seconds.')}</p></div><div class="card row"><span data-connection role="status"></span><button type="button" class="btn ghost sm" data-refresh>${a('تحديث الآن', 'Refresh now')}</button></div><p role="status" data-message></p><div data-board class="inbox-orders"></div>`;
  const board = el.querySelector('[data-board]'), connection = el.querySelector('[data-connection]'), message = el.querySelector('[data-message]');
  const refresh = async () => {
    clearTimeout(timer);
    if (!el.isConnected || busy || acting) return;
    busy = true;
    try {
      const d = await api('/api/branch/orders/operations' + (tables ? '?view=tables' : ''));
      if (!el.isConnected) return;
      connection.textContent = a('متصل · آخر تحديث ', 'Connected · updated ') + new Date(d.now).toLocaleTimeString(lang === 'ar' ? 'ar-SA' : 'en-GB');
      connection.dataset.state = 'connected';
      if (tables) {
        board.innerHTML = d.tables.length ? d.tables.map((t) => `<article class="card"><h3>${a('طاولة', 'Table')} ${esc(t.table)}</h3>${t.orders.map((o) => `<p>${esc(status(o.status))}${o.number ? ` · #${esc(o.number)}` : ''} · ${esc(money(o.total))}</p>`).join('')}<a class="text-link" href="#inbox">${a('افتح طلبات المنيو', 'Open menu orders')}</a></article>`).join('') : `<p class="card">${a('لا توجد طلبات محلية مفتوحة مرتبطة بطاولة.', 'No open dine-in orders assigned to a table.')}</p>`;
      } else {
        board.innerHTML = d.tickets.length ? d.tickets.map((t) => `<article class="card"><div class="row"><h3>#${esc(t.number)}</h3><span class="pill">${esc(status(t.status))}</span></div><p class="small muted">${esc(relTime(d.now - t.created_at))}${t.details.table ? ` · ${a('طاولة', 'Table')} ${esc(t.details.table)}` : ''}${t.invoice_number ? ` · ${a('فاتورة', 'Invoice')} ${esc(t.invoice_number)}` : ''}</p>${t.items.length ? `<ul class="order-lines">${t.items.map((i) => `<li><span>${esc(pick(i, 'name') || i.id || i.item_id)}${i.options?.length ? `<small>${i.options.map((o) => esc(pick(o, 'name'))).join(' · ')}</small>` : ''}</span><b>× ${esc(i.quantity)}</b></li>`).join('')}</ul>` : `<p class="small muted">${a('نداء كاشير — لا توجد أصناف مرتبطة.', 'Cashier pager — no linked items.')}</p>`}${t.note ? `<p>${esc(t.note)}</p>` : ''}${t.status === 'preparing' && permissions.tickets_call !== false ? `<button type="button" class="btn" data-ready="${esc(t.id)}" data-version="${t.version}">${a('جاهز وتنبيه العميل', 'Ready and alert guest')}</button>` : ''}</article>`).join('') : `<p class="card">${a('لا توجد نداءات مفتوحة.', 'No open pagers.')}</p>`;
        board.querySelectorAll('[data-ready]').forEach((button) => button.onclick = async () => {
          if (acting || busy) return;
          acting = true;
          board.querySelectorAll('button').forEach((b) => b.disabled = true);
          try {
            const r = await api(`/api/branch/tickets/${button.dataset.ready}/ready`, { method: 'POST', body: { version: Number(button.dataset.version) } });
            message.textContent = r.push?.sent ? a('جاهز. أُرسل إشعار للعميل.', 'Ready. Guest notification sent.') : a('جاهز. لم يُؤكد وصول إشعار؛ نادِ الرقم.', 'Ready. No guest notification confirmed; call the number.');
          } catch (e) { message.textContent = e.status === 409 ? a('تغير النداء من جهاز آخر. نعرض أحدث حالة.', 'Pager changed on another device. Refreshing its state.') : a('تعذر تأكيد الإجراء. نعيد قراءة الحالة.', 'Action could not be confirmed. Refreshing its state.'); }
          finally { acting = false; announce(message.textContent); await refresh(); }
        });
      }
    } catch (e) {
      connection.textContent = e.status === 401 ? a('انتهت الجلسة. سجّل الدخول.', 'Session expired. Sign in again.') : a('تعذر التحديث. البيانات المعروضة قديمة؛ نعيد المحاولة.', 'Refresh failed. Displayed data may be stale; retrying.');
      connection.dataset.state = 'error';
    } finally { busy = false; if (el.isConnected) timer = setTimeout(refresh, 5000); }
  };
  el.querySelector('[data-refresh]').onclick = refresh;
  onLive(board, ['order', 'ticket'], refresh);
  await refresh();
}
