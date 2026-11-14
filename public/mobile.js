import { mobileReadiness, readMobileEnvironment } from './mobile-client.js';
import { lang } from './common.js';

// No permissions or push subscriptions are requested on page load.
const ar = lang !== 'en';
const text = (a, e) => ar ? a : e;
const panel = document.createElement('details');
panel.className = 'card wrap narrow';
panel.id = 'mobile-readiness';
const summary = document.createElement('summary');
summary.textContent = text('التثبيت والاتصال والتنبيهات', 'Install, connection and alerts');
const status = document.createElement('p');
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
const guide = document.createElement('p');
const notifications = document.createElement('p');
const offline = document.createElement('p');
offline.className = 'small muted';
offline.textContent = text('تحتاج حالة الطلب والدور وبطاقة الولاء إلى اتصال مباشر. عند انقطاع الشبكة، أعد الاتصال قبل الاعتماد على الحالة. لا تُرسل الإجراءات دون اتصال؛ أعد المحاولة بعد عودته.', 'Order, queue and loyalty status need a live connection. Reconnect before relying on any status. Actions cannot be sent offline; retry once online.');
const install = document.createElement('button');
install.type = 'button';
install.className = 'btn ghost';
install.textContent = text('إضافة إلى الجهاز', 'Install on this device');
install.hidden = true;
panel.append(summary, status, guide, notifications, install, offline);
// In the owner workspace the panel belongs to the content column; placed after
// <main> it ends the sticky sidebar's containing block early and pushes the
// navigation up under the header while the page still scrolls.
const workspace = document.body.classList.contains('dashboard-page') ? document.getElementById('main') : null;
if (workspace) {
  const place = () => { if (panel.parentElement !== workspace) workspace.append(panel); };
  place();
  new MutationObserver(place).observe(workspace, { childList: true });
} else document.querySelector('footer')?.before(panel);
let prompt = null;
let registrationFailed = false;

function render() {
  const ready = mobileReadiness(readMobileEnvironment());
  status.textContent = ready.online
    ? text('الشبكة متصلة. يتم التحقق من حالة الخدمة داخل الصفحة.', 'Network connected. This page checks the service status separately.')
    : text('أنت غير متصل. أعد الاتصال لتحديث الحالة وتنفيذ الإجراءات.', 'You are offline. Reconnect to refresh status and perform actions.');
  guide.textContent = ready.installed
    ? text('تعمل الصفحة من الشاشة الرئيسية.', 'Running from your Home Screen.')
    : ready.install === 'ios-home-screen'
      ? text('على iPhone وiPad: افتح الصفحة في Safari، ثم المشاركة ← إضافة إلى الشاشة الرئيسية. افتح الأيقونة الجديدة وفعّل التنبيهات من صفحة الطلب أو الدور أو البطاقة.', 'On iPhone and iPad: open in Safari, then Share → Add to Home Screen. Open the new icon and enable alerts from the order, queue or card page.')
      : text('للوصول السريع، اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية» من قائمة المتصفح إذا توفرت. التثبيت لا يفعّل التنبيهات تلقائيًا.', 'For quick access, choose “Install app” or “Add to Home Screen” in your browser menu when available. Installation does not enable alerts automatically.');
  const messages = {
    unsupported: text('هذا المتصفح لا يدعم تنبيهات الخلفية حاليًا. أبقِ صفحة الطلب أو الدور مفتوحة.', 'This browser cannot use background alerts here. Keep the order or queue page open.'),
    'install-required': text('تنبيهات الخلفية على iPhone وiPad تتطلب إصدارًا داعمًا وفتح الصفحة من الشاشة الرئيسية.', 'Background alerts on iPhone and iPad require a supported OS and opening the page from the Home Screen.'),
    blocked: text('الإشعارات محظورة. غيّر إذن الموقع في إعدادات المتصفح أو النظام، ثم فعّلها من صفحة الطلب أو الدور أو البطاقة.', 'Notifications are blocked. Change the site permission in browser or system settings, then enable them from the order, queue or card page.'),
    'permission-required': text('لتفعيل التنبيهات، استخدم زر التنبيه في صفحة الطلب أو الدور أو البطاقة. يلزم إذن الجهاز وتهيئة الخدمة.', 'To enable alerts, use the alert button on the order, queue or card page. Device permission and service configuration are required.'),
    'permission-granted': text('إذن الإشعارات مسموح. تأكد من تفعيل التنبيه للطلب أو الدور أو البطاقة الحالية؛ الإذن وحده لا يؤكد الاشتراك.', 'Notification permission is granted. Enable alerts for the current order, queue or card; permission alone does not confirm a subscription.'),
  };
  notifications.textContent = registrationFailed
    ? text('تعذر تهيئة دعم العمل دون اتصال. أعد تحميل الصفحة عند استقرار الشبكة؛ ما زال إذن الإشعارات يحتاج تفعيلًا من صفحة الخدمة.', 'Offline support could not be prepared. Reload on a stable connection; alerts still need activation from the service page.')
    : messages[ready.notifications];
  install.hidden = !prompt || ready.installed;
}
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  prompt = event;
  render();
});
install.addEventListener('click', async () => {
  const pending = prompt;
  if (!pending) return;
  prompt = null;
  render();
  try { await pending.prompt(); await pending.userChoice; } catch {}
});
window.addEventListener('appinstalled', () => { prompt = null; render(); });
window.addEventListener('online', render);
window.addEventListener('offline', render);
window.addEventListener('pageshow', render);
window.addEventListener('focus', render);
render();
if (mobileReadiness(readMobileEnvironment()).canRegister) {
  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {
    registrationFailed = true;
    render();
  });
}
