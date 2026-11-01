import {
  api,
  esc,
  lang,
  money,
  pick,
  unlockAudio,
  chime,
  announce,
} from "./common.js";
import { confirmAction } from "./forms.js";
const a = (ar, en) => (lang === "ar" ? ar : en);
const statuses = {
  pending: ["بانتظار القبول", "Awaiting acceptance"],
  accepted: ["قُبل وأنشئ النداء", "Accepted · pager created"],
  rejected: ["مرفوض", "Rejected"],
};

export async function orderInbox(el) {
  let orders = [],
    filter = "pending",
    timer = null,
    busy = false,
    queued = false,
    stopped = false,
    armed = false,
    initialized = false,
    seen = new Set();
  const refreshWaiters = [];
  const cards = new Map(),
    drafts = new Map();
  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a("من المنيو إلى الكاشير", "MENU TO COUNTER")}</span><h2>${a("طلبات المنيو", "Menu orders")}</h2><p>${a("راجع الطلب واقبله لإنشاء النداء. الدفع عند الكاشير.", "Review and accept each order to create a pager. Payment is at the counter.")}</p></div><section class="inbox-toolbar card"><div><span class="connection-status" role="status" id="inbox-connection">${a("جارٍ الاتصال…", "Connecting…")}</span><p class="small muted">${a("تحديث تلقائي كل 5 ثوانٍ أثناء فتح الصفحة.", "Refreshes every 5 seconds while this page is open.")} <time id="inbox-updated"></time></p></div><div class="row"><button id="inbox-sound" class="btn ghost sm" type="button" aria-pressed="false">${a("تفعيل صوت الطلبات", "Enable order sound")}</button><button id="refresh-inbox" class="btn ghost sm" type="button">${a("تحديث الآن", "Refresh now")}</button></div></section><p class="small muted" id="inbox-sound-note">${a("الصوت يحتاج ضغطة تفعيل وهذه الصفحة مفتوحة؛ يخضع للوضع الصامت وإعدادات الجهاز.", "Sound needs your activation and this page open; silent mode and device settings apply.")}</p><div class="inbox-filters" aria-label="${a("تصفية الطلبات", "Filter orders")}">${[
    ["pending", "بانتظار القبول", "Awaiting acceptance"],
    ["all", "كل الطلبات", "All orders"],
  ]
    .map(
      ([k, ar, en]) =>
        `<button type="button" class="btn ghost sm" data-filter="${k}" aria-pressed="${k === "pending"}">${a(ar, en)} <span data-count="${k}">0</span></button>`,
    )
    .join(
      "",
    )}</div><p role="status" id="inbox-message"></p><div id="inbox-orders" class="inbox-orders"></div>`;
  const list = el.querySelector("#inbox-orders"),
    message = el.querySelector("#inbox-message"),
    refreshButton = el.querySelector("#refresh-inbox"),
    connection = el.querySelector("#inbox-connection");
  const time = (n) =>
    new Intl.DateTimeFormat(
      lang === "ar" ? "ar-SA-u-ca-gregory-nu-latn" : "en-GB",
      {
        timeZone: "Asia/Riyadh",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      },
    ).format(new Date(n));
  function state(text, ok) {
    if (connection.textContent !== text) connection.textContent = text;
    connection.dataset.state = ok ? "connected" : "error";
  }
  function render() {
    el.querySelector("[data-count=pending]").textContent = orders.filter(
      (o) => o.status === "pending",
    ).length;
    el.querySelector("[data-count=all]").textContent = orders.length;
    const visible = orders.filter(
        (o) => filter === "all" || o.status === "pending",
      ),
      visibleIds = new Set(visible.map((o) => o.id));
    for (const [id, card] of cards)
      if (!visibleIds.has(id)) {
        card.remove();
        cards.delete(id);
      }
    list.querySelector(".inbox-empty")?.remove();
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "card inbox-empty";
      empty.innerHTML = `<h3>${filter === "pending" ? a("كل الطلبات مراجَعة.", "All caught up.") : a("بانتظار أول طلب.", "Waiting for the first order.")}</h3><p class="muted">${filter === "pending" ? a("الطلبات الجديدة ستظهر هنا تلقائيًا.", "New orders will appear here automatically.") : a("فعّل الطلب من إعدادات الفرع وشارك المنيو.", "Enable orders in branch settings and share the menu.")}</p>`;
      list.append(empty);
      return;
    }
    visible.forEach((o, index) => {
      let card = cards.get(o.id);
      if (!card || card.dataset.version !== String(o.version)) {
        const node = document.createElement("article");
        node.className = "card inbox-order";
        node.dataset.version = o.version;
        node.dataset.orderId = o.id;
        node.innerHTML = `<header class="editor-heading"><span class="pill ${o.status === "pending" ? "pending" : o.status === "accepted" ? "ready" : "rejected"}">${esc(a(...(statuses[o.status] || [o.status, o.status])))}</span><time class="small muted" datetime="${new Date(o.created_at).toISOString()}">${esc(time(o.created_at))}</time></header><h3>${esc(money(o.total))}</h3><ul class="order-lines">${(o.items || []).map((i) => `<li><span>${esc(pick(i, "name") || i.item_id)}</span><b>× ${esc(i.quantity)}</b></li>`).join("")}</ul>${o.status === "pending" ? `<label class="invoice-field">${a("رقم الفاتورة (اختياري)", "Invoice number (optional)")}<input name="invoice_number" maxlength="64" autocomplete="off" value="${esc(drafts.get(o.id) || "")}"></label><div class="row"><button type="button" class="btn" data-order="${esc(o.id)}" data-action="accept">${a("قبول وإنشاء نداء", "Accept and create pager")}</button><button type="button" class="btn ghost" data-order="${esc(o.id)}" data-action="reject">${a("رفض الطلب", "Reject order")}</button></div>` : o.status === "accepted" ? `<a class="text-link" href="#orders">${a("افتح لوحة النداء", "Open pager board")} ↗</a>` : `<p class="small muted">${a("لم يُنشأ نداء لهذا الطلب.", "No pager was created for this order.")}</p>`}`;
        node
          .querySelector("input")
          ?.addEventListener("input", (e) => drafts.set(o.id, e.target.value));
        node
          .querySelectorAll("[data-action]")
          .forEach((button) => (button.onclick = () => act(o, button)));
        if (card) card.replaceWith(node);
        card = node;
        cards.set(o.id, card);
      }
      const at = list.children[index];
      if (at !== card) list.insertBefore(card, at || null);
    });
  }
  async function act(order, button) {
    if (queued) return;
    queued = true;
    clearTimeout(timer);
    const card = button.closest("article");
    card.setAttribute("aria-busy", "true");
    card.querySelectorAll("button,input").forEach((b) => (b.disabled = true));
    try {
      if (busy) await new Promise((resolve) => refreshWaiters.push(resolve));
      if (!el.isConnected) return;
      if (
        button.dataset.action === "reject" &&
        !(await confirmAction({
          title: a("رفض طلب المنيو؟", "Reject menu order?"),
          description: a(
            "سيظهر للعميل أن طلبه مرفوض، ولن يُنشأ له نداء.",
            "The customer will see the order as rejected. No pager will be created.",
          ),
          confirmLabel: a("رفض الطلب", "Reject order"),
        }))
      )
        return;
      if (!el.isConnected) return;
      busy = true;
      message.textContent = "";
      const result = await api(
        `/api/branch/orders/${order.id}/${button.dataset.action}`,
        {
          method: "POST",
          body: {
            version: order.version,
            invoice_number: drafts.get(order.id) || "",
          },
        },
      );
      drafts.delete(order.id);
      message.textContent =
        button.dataset.action === "accept"
          ? a(
              `قُبل الطلب وأنشئ النداء ${result.ticket?.number || ""}.`,
              `Order accepted. Pager ${result.ticket?.number || ""} created.`,
            )
          : a("رُفض الطلب.", "Order rejected.");
      announce(message.textContent);
    } catch (err) {
      message.textContent =
        err.status === 409
          ? a(
              "تغيّر الطلب من جهاز آخر. نعرض آخر حالة؛ راجعها قبل المحاولة.",
              "Another device changed this order. Review its latest state before retrying.",
            )
          : a(
              "تعذر تنفيذ الإجراء. لم نؤكد نجاحه؛ نعيد قراءة الحالة قبل إعادة المحاولة.",
              "The action could not be confirmed. Refreshing its state before retrying.",
            );
    } finally {
      busy = false;
      queued = false;
      card.removeAttribute("aria-busy");
      card
        .querySelectorAll("button,input")
        .forEach((b) => (b.disabled = false));
      await refresh();
    }
  }
  async function refresh() {
    clearTimeout(timer);
    if (stopped || !el.isConnected) {
      stopped = true;
      return;
    }
    if (busy || queued) {
      if (!queued) timer = setTimeout(refresh, 5000);
      return;
    }
    busy = true;
    refreshButton.disabled = true;
    try {
      const d = await api("/api/branch/orders");
      if (!el.isConnected) return;
      const incoming = d.orders.filter(
        (o) => o.status === "pending" && !seen.has(o.id),
      );
      if (initialized && incoming.length) {
        if (armed) chime(1);
        announce(
          a(
            `${incoming.length} طلب جديد من المنيو.`,
            `${incoming.length} new menu order(s).`,
          ),
        );
      }
      orders = d.orders;
      seen = new Set(orders.map((o) => o.id));
      const pendingIds = new Set(
        orders.filter((o) => o.status === "pending").map((o) => o.id),
      );
      for (const id of drafts.keys())
        if (!pendingIds.has(id)) drafts.delete(id);
      initialized = true;
      render();
      state(a("متصل · التحديث تلقائي", "Connected · auto refresh"), true);
      el.querySelector("#inbox-updated").textContent = time(Date.now());
    } catch (err) {
      if (!el.isConnected) return;
      state(
        err.status === 401
          ? a(
              "انتهت الجلسة. سجّل الدخول مجددًا.",
              "Session expired. Sign in again.",
            )
          : a(
              "تعذر التحديث. نعيد المحاولة تلقائيًا.",
              "Refresh failed. Retrying automatically.",
            ),
        false,
      );
      if (!initialized) {
        list.innerHTML = `<div class="card inbox-empty"><h3>${a("لم تصل قائمة الطلبات بعد.", "Orders have not loaded yet.")}</h3><p>${a("اضغط تحديث الآن لإعادة المحاولة.", "Press Refresh now to retry.")}</p></div>`;
      }
    } finally {
      busy = false;
      refreshButton.disabled = false;
      refreshWaiters.splice(0).forEach((resolve) => resolve());
      if (!queued && !stopped && el.isConnected)
        timer = setTimeout(refresh, 5000);
    }
  }
  el.querySelectorAll("[data-filter]").forEach(
    (b) =>
      (b.onclick = () => {
        filter = b.dataset.filter;
        el.querySelectorAll("[data-filter]").forEach((x) =>
          x.setAttribute("aria-pressed", String(x === b)),
        );
        render();
      }),
  );
  el.querySelector("#inbox-sound").onclick = (e) => {
    armed = !armed && unlockAudio();
    e.currentTarget.setAttribute("aria-pressed", String(armed));
    e.currentTarget.textContent = armed
      ? a("إيقاف صوت الطلبات", "Disable order sound")
      : a("تفعيل صوت الطلبات", "Enable order sound");
    if (armed) chime(1);
  };
  refreshButton.onclick = () => refresh();
  await refresh();
}
