// Setup progress: the facts the owner overview needs to show how ready the
// business is, computed in one request so the overview stays fast.
import { requireRole } from './context.js';
import { aiConfigured } from './ai-import.js';

export function registerSetup(app) {
  app.get('/api/owner/setup', requireRole('owner'), async (c) => {
    const org = c.get('user').org_id;
    const q = (sql) => c.env.DB.prepare(sql).bind(org).first();
    const [design, items, branches] = await Promise.all([
      q('SELECT published_json IS NOT NULL AS published FROM org_designs WHERE org_id=?'),
      q("SELECT COUNT(*) AS total, SUM(CASE WHEN image_url IS NOT NULL AND image_url<>'' THEN 1 ELSE 0 END) AS photos, SUM(CASE WHEN badges<>'[]' THEN 1 ELSE 0 END) AS badged FROM items WHERE org_id=? AND active=1 AND is_sample=0"),
      q("SELECT SUM(CASE WHEN s.hours_json IS NOT NULL AND s.hours_json<>'[]' THEN 1 ELSE 0 END) AS hours, SUM(CASE WHEN (s.maps_url IS NOT NULL AND s.maps_url<>'') OR (s.address IS NOT NULL AND s.address<>'') THEN 1 ELSE 0 END) AS location, SUM(CASE WHEN b.google_review_url IS NOT NULL AND b.google_review_url<>'' THEN 1 ELSE 0 END) AS review FROM branches b LEFT JOIN branch_settings s ON s.branch_id=b.id WHERE b.org_id=? AND b.active=1"),
    ]);
    return c.json({
      design_published: Boolean(design?.published),
      items: items?.total || 0,
      photos: items?.photos || 0,
      badged: items?.badged || 0,
      hours: Boolean(branches?.hours),
      location: Boolean(branches?.location),
      review_link: Boolean(branches?.review),
      ai_import: aiConfigured(c.env),
    });
  });
}
