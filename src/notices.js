import { mailConfigured, send } from './mail.js';
import { PLANS } from './context.js';
import { now } from './util.js';

// Billing emails. Each (org, kind, period_end) is sent at most once, recorded before sending so a
// retry never double-mails; a failed send is logged by removing the record so the next run retries.
const DAY = 86400000;
const sar = (halalas) => (halalas / 100).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' ر.س';
const base = (env) => env.PUBLIC_BASE_URL.replace(/\/$/, '');
const NAMES = { pager: 'المنادي', basic: 'الأساسية', pro: 'الاحترافية', chains: 'السلاسل' };
const planName = (p) => NAMES[p] || PLANS[p]?.id || p;

async function owners(env, orgId) {
  const { results } = await env.DB.prepare("SELECT email, name FROM users WHERE org_id = ? AND role = 'owner' AND disabled = 0 LIMIT 3").bind(orgId).all();
  return results;
}

async function once(env, orgId, kind, periodEnd, fn) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO billing_notices (org_id, kind, period_end, sent_at) VALUES (?, ?, ?, ?)').bind(orgId, kind, periodEnd, now()).run();
  if (!r.meta?.changes) return false;
  try { await fn(); return true; } catch (error) {
    await env.DB.prepare('DELETE FROM billing_notices WHERE org_id = ? AND kind = ? AND period_end = ?').bind(orgId, kind, periodEnd).run();
    throw error;
  }
}

export async function sendPaymentReceipt(env, checkout, periodEnd) {
  if (!mailConfigured(env)) return;
  await once(env, checkout.org_id, 'receipt:' + checkout.id, periodEnd, async () => {
    for (const o of await owners(env, checkout.org_id)) {
      await send(env, o.email, 'تم استلام دفعتك · زيمارا منيو', [
        `أهلًا ${o.name || ''}،`,
        `استلمنا دفعتك بمبلغ ${sar(checkout.total)} لباقة ${planName(checkout.plan)} (${checkout.cycle === 'annual' ? 'سنوي' : 'شهري'}).`,
        `اشتراكك فعّال حتى ${new Date(periodEnd).toLocaleDateString('ar-SA-u-nu-latn')}.`,
        'هذه رسالة تأكيد دفع وليست فاتورة ضريبية. تصدر الفاتورة من لوحة الاشتراك عند تفعيل الفوترة الإلكترونية.',
      ], `${base(env)}/app#subscription`, 'عرض الاشتراك', 'وصلتك هذه الرسالة لأنك مالك حساب في زيمارا منيو.');
    }
  });
}

export async function sendBillingNotices(env) {
  if (!mailConfigured(env)) return;
  const t = now();
  const { results } = await env.DB.prepare(`SELECT org_id, plan, status, trial_ends_at, current_period_end, cancel_at_period_end FROM subscriptions
    WHERE (status = 'trial' AND trial_ends_at BETWEEN ? AND ?) OR (status = 'active' AND cancel_at_period_end = 0 AND current_period_end BETWEEN ? AND ?) LIMIT 200`)
    .bind(t, t + 3 * DAY, t, t + 7 * DAY).all();
  for (const s of results) {
    const trial = s.status === 'trial';
    const end = trial ? s.trial_ends_at : s.current_period_end;
    const left = end - t;
    const kind = trial ? 'trial_3d' : left <= DAY ? 'renew_1d' : 'renew_7d';
    const date = new Date(end).toLocaleDateString('ar-SA-u-nu-latn');
    try {
      await once(env, s.org_id, kind, end, async () => {
        for (const o of await owners(env, s.org_id)) {
          await send(env, o.email, trial ? 'تجربتك تنتهي قريبًا · زيمارا منيو' : 'موعد تجديد اشتراكك · زيمارا منيو', [
            `أهلًا ${o.name || ''}،`,
            trial ? `تنتهي فترة التجربة المجانية في ${date}. اختر باقتك قبلها حتى يستمر المنيو والتنبيه بلا انقطاع.`
              : `ينتهي اشتراكك في باقة ${planName(s.plan)} في ${date}. جدّد الآن حتى لا يتوقف المنيو والتنبيه.`,
          ], `${base(env)}/app#subscription`, trial ? 'اختر باقتك' : 'جدّد الآن', 'وصلتك هذه الرسالة لأنك مالك حساب في زيمارا منيو.');
        }
      });
    } catch { /* retried next hour */ }
  }
}
