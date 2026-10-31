// Image fields for the dashboard: paste a link or upload a photo from the device.
// Photos are resized in the browser (longest side 1600px) before upload, so phone
// pictures of several megabytes become a light WebP or JPEG.
import { api, esc, lang } from './common.js';

const a = (ar, en) => (lang === 'ar' ? ar : en);
const MAX_SIDE = 1600;
const LIMIT = 1_500_000;

export function imageField(name, label, value = '', prefix = 'f', hint = '') {
  const id = `${prefix}-${name}`;
  return `<div class="image-field" data-image-field>
    <label for="${id}">${esc(label)}</label>
    <div class="image-field-row">
      <span class="image-preview" aria-hidden="true">${value ? `<img src="${esc(value)}" alt="">` : imgIcon}</span>
      <div class="image-field-controls">
        <div class="image-field-buttons">
          <label class="btn ghost sm upload-btn"><input type="file" accept="image/png,image/jpeg,image/webp" data-upload-for="${id}" class="visually-hidden">${a('رفع صورة', 'Upload photo')}</label>
          <button type="button" class="btn ghost sm" data-clear-for="${id}" ${value ? '' : 'hidden'}>${a('إزالة', 'Remove')}</button>
        </div>
        <input id="${id}" name="${name}" type="text" inputmode="url" dir="ltr" placeholder="${a('أو الصق رابط صورة https://', 'or paste an image link https://')}" value="${esc(value)}">
        <p class="small muted" data-status-for="${id}" role="status">${esc(hint)}</p>
      </div>
    </div>
  </div>`;
}

const imgIcon = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>';

async function shrink(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const [type, q] of [['image/webp', 0.85], ['image/jpeg', 0.85], ['image/jpeg', 0.7]]) {
      const blob = await new Promise((r) => canvas.toBlob(r, type, q));
      if (blob && blob.type === type && blob.size <= LIMIT) return blob;
    }
  } catch {
    // Fall through: an image the browser cannot decode is sent as is and checked by the server.
  } finally {
    URL.revokeObjectURL(url);
  }
  return file;
}

export async function uploadImage(file) {
  const blob = await shrink(file);
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || blob.size > LIMIT) {
    const e = new Error('asset_size_limit');
    e.status = 400;
    throw e;
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  const d = await api('/api/owner/assets', { method: 'POST', body: { mime: blob.type, data: btoa(binary) }, timeout: 45000 });
  return d.url;
}

export function wireImageFields(root) {
  root.querySelectorAll('[data-image-field]').forEach((box) => {
    const input = box.querySelector('input[name]');
    const file = box.querySelector('[data-upload-for]');
    const clear = box.querySelector('[data-clear-for]');
    const status = box.querySelector('[data-status-for]');
    const preview = box.querySelector('.image-preview');
    const show = (v) => {
      preview.innerHTML = v ? `<img src="${esc(v)}" alt="">` : imgIcon;
      clear.hidden = !v;
    };
    input.addEventListener('change', () => show(input.value.trim()));
    clear.onclick = () => { input.value = ''; show(''); status.textContent = ''; };
    file.onchange = async () => {
      const f = file.files[0];
      if (!f) return;
      const label = box.querySelector('.upload-btn');
      label.classList.add('busy');
      status.textContent = a('جارٍ رفع الصورة…', 'Uploading…');
      try {
        input.value = await uploadImage(f);
        show(input.value);
        status.textContent = a('تم رفع الصورة. اضغط حفظ لتطبيقها.', 'Photo uploaded. Press Save to apply it.');
      } catch (err) {
        status.textContent = err?.message === 'asset_storage_limit'
          ? a('امتلأت مساحة الملفات في حسابك. احذف صورًا قديمة أو تواصل معنا.', 'Your file storage is full.')
          : a('تعذر رفع الصورة. جرّب صورة PNG أو JPG أو WebP أصغر.', 'Could not upload. Try a smaller PNG, JPG or WebP.');
      } finally {
        label.classList.remove('busy');
        file.value = '';
      }
    };
  });
}
