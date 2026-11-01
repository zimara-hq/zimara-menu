import { esc, lang, announce } from "./common.js";

const a = (ar, en) => (lang === "ar" ? ar : en);
const forms = new Map();
let sequence = 0,
  leaving = null;

export function watchForm(form) {
  if (forms.has(form)) return forms.get(form);
  form.noValidate = true;
  const state = { dirty: false, busy: false };
  const dirty = () => {
    state.dirty = true;
    form.dataset.dirty = "true";
  };
  form.addEventListener("input", dirty);
  form.addEventListener("change", dirty);
  forms.set(form, state);
  return state;
}
export function markFormDirty(form) {
  const s = watchForm(form);
  s.dirty = true;
  form.dataset.dirty = "true";
}
export function markFormSaved(form) {
  const s = watchForm(form);
  s.dirty = false;
  form.dataset.dirty = "false";
}
export function formBusy(form) {
  return forms.get(form)?.busy === true;
}
export function setFormBusy(form) {
  const state = watchForm(form);
  state.busy = true;
  form.setAttribute("aria-busy", "true");
  const controls = [
    ...form.querySelectorAll("button,input,select,textarea"),
  ].map((b) => [b, b.disabled]);
  controls.forEach(([b]) => (b.disabled = true));
  return () => {
    state.busy = false;
    form.removeAttribute("aria-busy");
    controls.forEach(([b, disabled]) => (b.disabled = disabled));
  };
}

function activeForms() {
  for (const [f] of forms) if (!f.isConnected) forms.delete(f);
  return [...forms];
}

export async function confirmAction({
  title,
  description,
  confirmLabel,
  danger = false,
  cancelLabel = a("إلغاء", "Cancel"),
}) {
  const previous = document.activeElement,
    dialog = document.createElement("dialog");
  dialog.className = "app-dialog";
  const id = "confirm-" + ++sequence;
  dialog.setAttribute("aria-labelledby", id);
  dialog.setAttribute("aria-describedby", id + "-description");
  dialog.innerHTML = `<form method="dialog" novalidate class="stack"><h2 id="${id}">${esc(title)}</h2><p id="${id}-description" class="muted">${esc(description)}</p><div class="row"><button class="btn ghost" value="cancel">${esc(cancelLabel)}</button><button class="btn ${danger ? "danger" : ""}" value="confirm">${esc(confirmLabel)}</button></div></form>`;
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector("[value=cancel]").focus();
  return new Promise((resolve) =>
    dialog.addEventListener(
      "close",
      () => {
        const confirmed = dialog.returnValue === "confirm";
        dialog.remove();
        if (previous?.isConnected) previous.focus();
        resolve(confirmed);
      },
      { once: true },
    ),
  );
}

export async function canLeaveWorkspace() {
  const active = activeForms();
  if (active.some(([, s]) => s.busy)) {
    announce(
      a(
        "جارٍ حفظ التغييرات. انتظر اكتمال العملية.",
        "Changes are being saved. Wait for the operation to finish.",
      ),
    );
    return false;
  }
  if (!active.some(([, s]) => s.dirty)) return true;
  if (leaving) return leaving;
  leaving = confirmAction({
    title: a("عندك تعديلات لم تُحفظ", "You have unsaved changes"),
    description: a(
      "هل تريد المغادرة والتخلّي عن هذه التعديلات؟ يمكنك متابعة التعديل وحفظها أولًا.",
      "Leave and discard these edits? You can keep editing and save them first.",
    ),
    confirmLabel: a("مغادرة دون حفظ", "Leave without saving"),
    cancelLabel: a("متابعة التعديل", "Keep editing"),
  })
    .then((ok) => {
      if (ok) active.forEach(([f]) => markFormSaved(f));
      return ok;
    })
    .finally(() => (leaving = null));
  return leaving;
}
addEventListener("beforeunload", (e) => {
  if (activeForms().some(([, s]) => s.dirty || s.busy)) {
    e.preventDefault();
    e.returnValue = "";
  }
});

function clearError(input) {
  const id = input.dataset.errorId;
  if (!id) return;
  document.getElementById(id)?.remove();
  input.removeAttribute("aria-invalid");
  const described = (input.getAttribute("aria-describedby") || "")
    .split(" ")
    .filter((x) => x && x !== id);
  described.length
    ? input.setAttribute("aria-describedby", described.join(" "))
    : input.removeAttribute("aria-describedby");
  delete input.dataset.errorId;
}
function errorFor(input) {
  const value = String(input.value || "").trim();
  if (
    input.required &&
    (!value || (input.type === "checkbox" && !input.checked))
  )
    return a("هذا الحقل مطلوب.", "This field is required.");
  if (!value) return null;
  if (input.maxLength > 0 && value.length > input.maxLength)
    return a(
      `اكتب ${input.maxLength} حرفًا كحد أقصى.`,
      `Use at most ${input.maxLength} characters.`,
    );
  if (input.minLength > 0 && value.length < input.minLength)
    return a(
      `اكتب ${input.minLength} أحرف على الأقل.`,
      `Use at least ${input.minLength} characters.`,
    );
  if (input.type === "tel" && !/^[+0-9 ()-]{5,30}$/.test(value))
    return a("اكتب رقم تواصل صحيحًا.", "Enter a valid contact number.");
  if (
    ["logo_url", "image_url"].includes(input.name) &&
    !/^\/api\/assets\/[a-z0-9-]{36}$/.test(value)
  ) {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" || u.username || u.password)
        throw new Error();
    } catch {
      return a(
        "استخدم رابط صورة https:// أو ارفع صورة من جهازك.",
        "Use an https:// image URL or upload a photo.",
      );
    }
  }
  if (input.type === "email" && input.validity.typeMismatch)
    return a("اكتب بريدًا إلكترونيًا صحيحًا.", "Enter a valid email address.");
  if (input.type === "url" && !/^https:\/\//i.test(value))
    return a(
      "ابدأ الرابط بـ https:// واكتب عنوانًا صحيحًا.",
      "Enter a valid URL starting with https://.",
    );
  if (input.type === "url") {
    try {
      const u = new URL(value);
      if (u.username || u.password || !u.hostname)
        return a("الرابط غير صالح.", "The URL is invalid.");
    } catch {
      return a("الرابط غير صالح.", "The URL is invalid.");
    }
  }
  if (
    input.type === "number" &&
    (input.validity.badInput ||
      input.validity.rangeUnderflow ||
      input.validity.rangeOverflow ||
      input.validity.stepMismatch)
  )
    return a(
      "راجع الرقم والحدود الموضحة.",
      "Check the number and allowed range.",
    );
  if (input.type === "time" && input.required && !/^\d{2}:\d{2}$/.test(value))
    return a("حدّد وقتًا صحيحًا.", "Choose a valid time.");
  return null;
}
export function validateForm(form) {
  if (form.querySelector("[data-uploading]")) {
    announce(
      a(
        "انتظر اكتمال رفع الصورة قبل الحفظ.",
        "Wait for the photo upload to finish before saving.",
      ),
    );
    return false;
  }
  let first = null;
  for (const input of form.querySelectorAll("input,textarea,select")) {
    clearError(input);
    if (
      input.disabled ||
      ["hidden", "file", "submit", "button"].includes(input.type)
    )
      continue;
    const message = errorFor(input);
    if (!message) continue;
    const id = "field-error-" + ++sequence,
      node = document.createElement("span");
    node.id = id;
    node.className = "field-error";
    node.textContent = message;
    input.dataset.errorId = id;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute(
      "aria-describedby",
      [input.getAttribute("aria-describedby"), id].filter(Boolean).join(" "),
    );
    input.insertAdjacentElement("afterend", node);
    first ??= input;
  }
  if (first) {
    first.focus();
    first.scrollIntoView({ block: "center", behavior: "instant" });
    announce(
      a(
        "راجع الحقول الموضّحة قبل الحفظ.",
        "Check the highlighted fields before saving.",
      ),
      true,
    );
    return false;
  }
  return true;
}
