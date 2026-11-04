import {staffPermissionsEditor} from './staff-permissions.js';
import {
  api,
  esc,
  lang,
  pick,
  qrSvg,
  announce,
  requestValue,
} from "./common.js";
import {
  watchForm,
  markFormSaved,
  validateForm,
  formBusy,
  setFormBusy,
  confirmAction,
  markFormDirty,
} from "./forms.js";
const a = (ar, en) => (lang === "ar" ? ar : en);
const field = (name, label, value = "", extra = "") =>
  `<label>${label}<input name="${name}" value="${esc(value)}" ${extra}></label>`;
const error = (el, err) => {
  el.textContent =
    err?.message === "demo_email_required"
      ? a(
          "في غرفة التجربة استخدم بريدًا ينتهي بـ @demo.invalid، مثل cashier@demo.invalid.",
          "In a demo room, use an email ending in @demo.invalid, such as cashier@demo.invalid.",
        )
      : err?.status === 403
        ? a(
            "قد لا تسمح باقتك أو صلاحيتك بهذا الإجراء. راجع باقتك.",
            "Your plan or role may not permit this action. Check your plan.",
          )
        : err?.status === 409
          ? a(
              "اسم الرابط أو البريد مستخدم. راجع البيانات ثم أعد المحاولة.",
              "The link name or email is already used. Review the details and retry.",
            )
          : a(
              "تعذر الحفظ. بقيت بياناتك هنا؛ تحقق من الاتصال وأعد المحاولة.",
              "Could not save. Your entries are still here; check your connection and retry.",
            );
};

export async function branchesView(el, me = {}) {
  const demo = me.user?.email?.endsWith("@demo.invalid");
  const { branches } = await api("/api/owner/branches");
  el.innerHTML = `<div class="section-intro"><span class="eyebrow">${a("فريقك وأماكنك", "YOUR PEOPLE & PLACES")}</span><h2>${a("فرع واحد أو أكثر. تحكّم واضح.", "Every location. Clearly managed.")}</h2><p>${a("عدّل الأسماء وروابط التقييم، وجهّز حساب الكاشير لكل فرع. رابط المنيو يبقى ثابتًا.", "Edit names and review links, and set up each cashier account. Menu links stay unchanged.")}</p></div><div class="branch-summary"><span><strong data-summary="total">${branches.length}</strong> ${a("إجمالي الفروع", "Total branches")}</span><span><strong data-summary="active">${branches.filter((b) => b.active).length}</strong> ${a("فرع فعّال", "Active branches")}</span><span><strong>${branches.filter((b) => b.account_email && !b.account_disabled).length}</strong> ${a("حساب كاشير جاهز", "Cashier accounts ready")}</span></div><div id="branch-directory" class="stack"></div><details class="card branch-add"><summary>${a("إضافة فرع جديد", "Add a new branch")} <span aria-hidden="true">+</span></summary><form id="new-branch-form" class="stack" novalidate><div class="grid2">${field("name_ar", a("اسم الفرع بالعربية", "Arabic branch name"), "", 'required maxlength="80"')}${field("name_en", a("اسم الفرع بالإنجليزية", "English branch name"), "", 'required maxlength="80"')}</div>${field("google_review_url", a("رابط تقييم قوقل (اختياري)", "Google review link (optional)"), "", 'type="url" placeholder="https://"')}<h3>${a("حساب الكاشير", "Cashier account")}</h3>${demo ? `<p class="small muted">${a("هذه غرفة تجربة: استخدم بريدًا ينتهي بـ @demo.invalid، مثل cashier@demo.invalid.", "This is a demo room: use an email ending in @demo.invalid, such as cashier@demo.invalid.")}</p>` : ""}<div class="grid2">${field("a_name", a("اسم الموظف", "Staff name"), "", 'required maxlength="80"')}${field("a_email", a("البريد الإلكتروني", "Email"), "", 'type="email" required autocomplete="off"')}${field("a_password", a("كلمة مرور — 10 أحرف على الأقل", "Password — at least 10 characters"), "", 'type="password" required minlength="10" autocomplete="new-password"')}</div><div role="status"></div><button class="btn" type="submit">${a("إنشاء الفرع وحساب الكاشير", "Create branch & cashier account")}</button></form></details>`;
  const directory = el.querySelector("#branch-directory");
  function updateSummary() {
    const values = [
      branches.length,
      branches.filter((b) => b.active).length,
      branches.filter((b) => b.account_email && !b.account_disabled).length,
    ];
    el.querySelectorAll(".branch-summary strong").forEach(
      (node, i) => (node.textContent = values[i]),
    );
  }
  function renderBranch(b, replacing = null) {
    const card = document.createElement("article");
    card.className = "card branch-workspace";
    const link = location.origin + "/m/" + b.slug;
    card.innerHTML = `<header class="editor-heading"><div><span class="pill ${b.active ? "ready" : "pending"}" data-branch-state>${b.active ? a("فعّال", "Active") : a("موقوف", "Inactive")}</span><h3 data-branch-name>${esc(pick(b, "name"))}</h3><p class="small muted">${esc(b.account_email || a("حساب الكاشير لم يُجهّز بعد", "Cashier account not set up"))}</p></div><a class="btn ghost sm" href="/m/${esc(b.slug)}" target="_blank" rel="noopener">${a("عرض المنيو", "View menu")} ↗</a></header><div class="branch-tools"><button type="button" class="btn ghost sm" data-copy>${a("نسخ رابط المنيو", "Copy menu link")}</button><button type="button" class="btn ghost sm" data-qr aria-expanded="false">${a("رمز المنيو العام", "Public menu QR")}</button><a class="btn ghost sm" href="#settings">${a("أوقات العمل والطلب", "Hours & ordering")}</a></div><div class="branch-qr" hidden>${qrSvg(link, 4)}<p class="small muted">${a("رمز ثابت للمنيو العام. لا يعرض نداء العملاء.", "A stable public menu QR. It never displays customer pagers.")}</p></div><details class="branch-edit"><summary>${a("تعديل بيانات الفرع", "Edit branch details")}</summary><form class="stack" novalidate><div class="grid2">${field("name_ar", a("الاسم بالعربية", "Arabic name"), b.name_ar, 'required maxlength="80"')}${field("name_en", a("الاسم بالإنجليزية", "English name"), b.name_en, 'required maxlength="80"')}</div>${field("google_review_url", a("رابط تقييم قوقل", "Google review link"), b.google_review_url || "", 'type="url" placeholder="https://"')}<label class="check"><input name="active" type="checkbox" ${b.active ? "checked" : ""}>${a("الفرع فعّال", "Branch is active")}</label><p class="small muted">${a("إيقاف الفرع يمنع الوصول لمنيوه وصلاحيات موظفه؛ تبقى بياناته ورابطه محفوظة.", "Deactivation blocks its menu and staff access. Its data and link are retained.")}</p><div role="status"></div><button type="submit" class="btn">${a("حفظ بيانات الفرع", "Save branch details")}</button></form></details><section class="branch-account"><div class="editor-heading"><div><h4>${a("حساب الكاشير", "Cashier account")}</h4><span class="small muted" data-account-state>${b.account_email ? (b.account_disabled ? a("الحساب موقوف", "Account disabled") : a("الحساب مفعّل", "Account enabled")) : a("أنشئ الحساب ليبدأ فريقك العمل", "Create an account for your team")}</span></div><div class="row">${b.account_email ? `<button type="button" class="btn ghost sm" data-password>${a("تغيير كلمة المرور", "Change password")}</button><button type="button" class="btn ghost sm" data-account-toggle>${b.account_disabled ? a("تفعيل الحساب", "Enable account") : a("إيقاف الحساب", "Disable account")}</button>` : `<button type="button" class="btn ghost sm" data-setup>${a("إعداد حساب الكاشير", "Set up cashier account")}</button>`}</div></div><div role="status"></div></section>`;
    if (replacing) replacing.replaceWith(card);
    else directory.append(card);
    const permissions=document.createElement("section");card.append(permissions);staffPermissionsEditor(permissions,b).catch(()=>{permissions.textContent=a("تعذر تحميل الصلاحيات. أعد فتح القسم.","Could not load permissions. Reopen this section.");});
    const f = card.querySelector("form");
    watchForm(f);
    card.querySelector("[data-copy]").onclick = async () => {
      try {
        await navigator.clipboard.writeText(link);
        announce(a("نُسخ رابط المنيو.", "Menu link copied."));
      } catch {
        announce(link);
      }
    };
    card.querySelector("[data-qr]").onclick = (e) => {
      const qr = card.querySelector(".branch-qr");
      qr.hidden = !qr.hidden;
      e.currentTarget.setAttribute("aria-expanded", String(!qr.hidden));
    };
    f.onsubmit = async (e) => {
      e.preventDefault();
      if (formBusy(f) || !validateForm(f)) return;
      const v = Object.fromEntries(new FormData(f)),
        active = Boolean(v.active);
      if (
        active !== Boolean(b.active) &&
        !(await confirmAction({
          title: active
            ? a("تفعيل الفرع؟", "Activate branch?")
            : a("إيقاف الفرع؟", "Deactivate branch?"),
          description: a(
            `${pick(b, "name")}: ${active ? "سيعود المنيو وحساب الفرع للعمل." : "سيُحجب المنيو ويُمنع وصول حساب الفرع. البيانات محفوظة ويمكن تفعيله مجددًا."}`,
            `${pick(b, "name")}: ${active ? "its menu and branch access will be restored." : "its menu and branch access will be blocked. Data is retained and it can be activated again."}`,
          ),
          confirmLabel: active
            ? a("تفعيل الفرع", "Activate branch")
            : a("إيقاف الفرع", "Deactivate branch"),
        }))
      )
        return;
      const release = setFormBusy(f),
        msg = f.querySelector("[role=status]");
      msg.textContent = "";
      try {
        await api("/api/owner/branches/" + b.id, {
          method: "PATCH",
          body: {
            name_ar: v.name_ar,
            name_en: v.name_en,
            google_review_url: v.google_review_url || null,
            active,
          },
        });
        Object.assign(b, {
          name_ar: v.name_ar,
          name_en: v.name_en,
          active,
          google_review_url: v.google_review_url || null,
        });
        markFormSaved(f);
        updateSummary();
        card.querySelector("[data-branch-name]").textContent = pick(b, "name");
        const state = card.querySelector("[data-branch-state]");
        state.textContent = active
          ? a("فعّال", "Active")
          : a("موقوف", "Inactive");
        state.className = "pill " + (active ? "ready" : "pending");
        msg.textContent = a(
          "حُفظت بيانات الفرع. رابط المنيو ثابت.",
          "Branch saved. The menu link is unchanged.",
        );
        announce(a("تم حفظ الفرع.", "Branch saved."));
      } catch (err) {
        error(msg, err);
      } finally {
        release();
      }
    };
    const account = card.querySelector(".branch-account"),
      accountStatus = account.querySelector("[role=status]");
    card
      .querySelector("[data-password]")
      ?.addEventListener("click", async (e) => {
        const button = e.currentTarget,
          pw = await requestValue({
            title: a("تغيير كلمة مرور الكاشير", "Change cashier password"),
            label: a(
              "كلمة مرور جديدة — 10 أحرف على الأقل",
              "New password — at least 10 characters",
            ),
            type: "password",
            confirmLabel: a("تغيير كلمة المرور", "Change password"),
            hint: a(
              "ستنتهي جلسات الكاشير الحالية ويحتاج تسجيل الدخول مجددًا.",
              "Current cashier sessions will end; sign in again with the new password.",
            ),
          });
        if (!pw) return;
        if (pw.length < 10) {
          accountStatus.textContent = a(
            "استخدم كلمة مرور من 10 أحرف على الأقل.",
            "Use a password of at least 10 characters.",
          );
          return;
        }
        button.disabled = true;
        try {
          await api(`/api/owner/branches/${b.id}/account`, {
            method: "PATCH",
            body: { password: pw },
          });
          accountStatus.textContent = a(
            "تغيّرت كلمة المرور وانتهت الجلسات القديمة.",
            "Password changed and previous sessions ended.",
          );
        } catch (err) {
          error(accountStatus, err);
        } finally {
          button.disabled = false;
        }
      });
    card
      .querySelector("[data-account-toggle]")
      ?.addEventListener("click", async (e) => {
        const button = e.currentTarget,
          disabled = !b.account_disabled;
        if (
          !(await confirmAction({
            title: disabled
              ? a("إيقاف حساب الكاشير؟", "Disable cashier account?")
              : a("تفعيل حساب الكاشير؟", "Enable cashier account?"),
            description: disabled
              ? a(
                  "ستنتهي جلساته الحالية، ولن يستطيع الدخول حتى تفعّله مجددًا.",
                  "Current sessions will end. The cashier cannot sign in until enabled again.",
                )
              : a(
                  "سيستطيع الكاشير تسجيل الدخول إلى هذا الفرع.",
                  "The cashier will be able to sign in to this branch.",
                ),
            confirmLabel: disabled
              ? a("إيقاف الحساب", "Disable account")
              : a("تفعيل الحساب", "Enable account"),
          }))
        )
          return;
        button.disabled = true;
        try {
          await api(`/api/owner/branches/${b.id}/account`, {
            method: "PATCH",
            body: { disabled },
          });
          b.account_disabled = disabled;
          updateSummary();
          button.textContent = disabled
            ? a("تفعيل الحساب", "Enable account")
            : a("إيقاف الحساب", "Disable account");
          card.querySelector("[data-account-state]").textContent = disabled
            ? a("الحساب موقوف", "Account disabled")
            : a("الحساب مفعّل", "Account enabled");
          accountStatus.textContent = a(
            "حُدثت صلاحية الحساب.",
            "Account access updated.",
          );
        } catch (err) {
          error(accountStatus, err);
        } finally {
          button.disabled = false;
        }
      });
    card.querySelector("[data-setup]")?.addEventListener("click", async () => {
      const email = await requestValue({
        title: a("حساب الكاشير", "Cashier account"),
        label: a("البريد الإلكتروني", "Email"),
        type: "email",
        confirmLabel: a("متابعة", "Continue"),
      });
      if (!email) return;
      const password = await requestValue({
        title: a("حساب الكاشير", "Cashier account"),
        label: a(
          "كلمة مرور من 10 أحرف على الأقل",
          "Password of at least 10 characters",
        ),
        type: "password",
        confirmLabel: a("إنشاء الحساب", "Create account"),
      });
      if (!password) return;
      try {
        await api(`/api/owner/branches/${b.id}/account`, {
          method: "PATCH",
          body: { email, password, name: a("الكاشير", "Cashier") },
        });
        const latest = {
          account_email: email.trim().toLowerCase(),
          account_disabled: 0,
        };
        const draft = watchForm(f).dirty
            ? Object.fromEntries(new FormData(f))
            : null,
          opened = card.querySelector(".branch-edit").open;
        Object.assign(b, latest);
        const replacement = renderBranch(b, card);
        replacement.querySelector(".branch-edit").open = opened;
        if (draft) {
          const target = replacement.querySelector("form");
          for (const [name, value] of Object.entries(draft)) {
            const input = target.elements[name];
            if (input && input.type !== "checkbox") input.value = value;
          }
          target.elements.active.checked = Boolean(draft.active);
          markFormDirty(target);
        }
        updateSummary();
        announce(a("أُنشئ حساب الكاشير.", "Cashier account created."));
      } catch (err) {
        error(accountStatus, err);
      }
    });
    return card;
  }
  branches.forEach((b) => renderBranch(b));
  const create = el.querySelector("#new-branch-form");
  watchForm(create);
  create.onsubmit = async (e) => {
    e.preventDefault();
    if (formBusy(create) || !validateForm(create)) return;
    const v = Object.fromEntries(new FormData(create)),
      release = setFormBusy(create);
    try {
      const created = await api("/api/owner/branches", {
        method: "POST",
        body: {
          name_ar: v.name_ar,
          name_en: v.name_en,
          google_review_url: v.google_review_url || null,
          account: { name: v.a_name, email: v.a_email, password: v.a_password },
        },
      });
      markFormSaved(create);
      create.reset();
      try {
        const latest = (await api("/api/owner/branches")).branches.find(
          (b) => b.id === created.id,
        );
        if (latest) {
          branches.push(latest);
          renderBranch(latest);
          updateSummary();
        }
      } catch {
        create.querySelector("[role=status]").textContent = a(
          "أُنشئ الفرع. أعد فتح هذا القسم لتحديث القائمة.",
          "Branch created. Reopen this section to refresh the list.",
        );
      }
      announce(
        a("أُنشئ الفرع وحساب الكاشير.", "Branch and cashier account created."),
      );
    } catch (err) {
      error(create.querySelector("[role=status]"), err);
    } finally {
      release();
    }
  };
}
