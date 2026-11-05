import { mailConfigured, send } from './mail.js';
import { now } from './util.js';

const RETRY_WINDOW = 23 * 3600000; // Resend retains idempotency keys for 24 hours.
const RETRY_DELAY = 5 * 60000;

// Payment settlement snapshots recipients and the paid period in the same transaction
// as activation. An interrupted send is retried with the same provider idempotency key.
// Beyond that provider guarantee, pause for review rather than risk a duplicate email.
export async function processReceiptOutbox(env) {
  if (!mailConfigured(env)) return { configured: false, processed: 0 };
  const t = now();
  await env.DB.prepare("UPDATE subscription_receipt_jobs SET state = 'pending', locked_at = NULL WHERE state = 'sending' AND locked_at < ?").bind(t - 60000).run();
  await env.DB.prepare("UPDATE subscription_receipt_jobs SET state = 'unknown', last_error = 'idempotency_window_elapsed' WHERE state = 'pending' AND first_attempt_at IS NOT NULL AND first_attempt_at <= ?").bind(t - RETRY_WINDOW).run();
  const { results } = await env.DB.prepare(`SELECT j.*, b.plan, b.cycle, b.total FROM subscription_receipt_jobs j
    JOIN billing_checkouts b ON b.id = j.checkout_id AND b.status = 'paid'
    WHERE j.state = 'pending' AND j.next_attempt_at <= ? ORDER BY j.created_at LIMIT 20`).bind(t).all();
  let processed = 0;
  for (const job of results) {
    const claimed = await env.DB.prepare(`UPDATE subscription_receipt_jobs SET state = 'sending', locked_at = ?,
      first_attempt_at = COALESCE(first_attempt_at, ?), sender = COALESCE(sender, ?), attempts = attempts + 1
      WHERE checkout_id = ? AND user_id = ? AND state = 'pending' AND next_attempt_at <= ?`)
      .bind(t, t, env.MAIL_FROM, job.checkout_id, job.user_id, t).run();
    if (!claimed.meta?.changes) continue;
    const names = { pager: 'المنادي', basic: 'الأساسية', pro: 'الاحترافية' };
    try {
      const providerId = await send(env, job.recipient_email, 'تم استلام دفعتك · زيمارا منيو', [
        `أهلًا ${job.recipient_name || ''}،`,
        `استلمنا دفعتك بمبلغ ${(job.total / 100).toFixed(2)} ر.س لباقة ${names[job.plan] || job.plan} (${job.cycle === 'annual' ? 'سنوي' : 'شهري'}).`,
        `اشتراكك فعّال حتى ${new Date(job.period_end).toLocaleDateString('ar-SA-u-nu-latn')}.`,
        'هذه رسالة تأكيد دفع وليست فاتورة ضريبية. راجع حالة الفاتورة في لوحة الاشتراك.',
      ], job.dashboard_url, 'عرض الاشتراك', 'وصلتك هذه الرسالة لأنك مالك حساب في زيمارا منيو.',
      { idempotencyKey: `receipt/${job.checkout_id}/${job.user_id}`, from: job.sender || env.MAIL_FROM });
      await env.DB.prepare("UPDATE subscription_receipt_jobs SET state = 'sent', sent_at = ?, provider_message_id = ?, locked_at = NULL, last_error = NULL WHERE checkout_id = ? AND user_id = ? AND state = 'sending'")
        .bind(now(), providerId, job.checkout_id, job.user_id).run();
    } catch {
      await env.DB.prepare("UPDATE subscription_receipt_jobs SET state = 'pending', next_attempt_at = ?, locked_at = NULL, last_error = 'mail_provider_error' WHERE checkout_id = ? AND user_id = ? AND state = 'sending'")
        .bind(now() + RETRY_DELAY, job.checkout_id, job.user_id).run();
    }
    processed++;
  }
  return { configured: true, processed };
}
