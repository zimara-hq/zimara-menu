// Ready-made pages per trade. Applying one sets the look (colour, layout, corners, cover) and,
// on an empty menu, adds sample items that stay hidden from guests until the owner edits them.
import { requireRole, audit, assertPlanQuota } from './context.js';
import { conflict, notFound, id, now } from './util.js';
import { sampleMenu } from './sample-menu.js';
import { DEFAULT_THEME } from './identity.js';

const M = (catAr, catEn, items) => [catAr, catEn, items];
const MENUS = {
  burger: [
    M('البرجر', 'Burgers', [['سماش كلاسيك', 'Classic smash', 'قطعتين لحم مع جبنة أمريكية وصوص البيت.', 'Two smashed patties, American cheese, house sauce.', 2900, 820], ['برجر دجاج حار', 'Spicy chicken', 'دجاج مقرمش بصوص حار ومخلل.', 'Crispy chicken, hot sauce, pickles.', 2600, 760], ['برجر الترافل', 'Truffle burger', 'لحم أنجوس مع مايونيز الترافل والفطر.', 'Angus beef, truffle mayo, mushrooms.', 3800, 900]]),
    M('الجانبيات', 'Sides', [['بطاطس مقلية', 'Fries', 'مقرمشة بالملح البحري.', 'Crispy with sea salt.', 900, 320], ['بطاطس بالجبن', 'Cheese fries', 'مع صوص الشيدر.', 'With cheddar sauce.', 1400, 480], ['حلقات بصل', 'Onion rings', 'ثمان قطع.', 'Eight pieces.', 1200, 410]]),
    M('المشروبات', 'Drinks', [['مشروب غازي', 'Soft drink', '330 مل.', '330 ml.', 500, 140], ['ميلك شيك فانيلا', 'Vanilla shake', 'آيس كريم فانيلا وحليب.', 'Vanilla ice cream and milk.', 1600, 520]]),
  ],
  roastery: [
    M('القهوة المختصة', 'Specialty coffee', [['V60', 'V60', 'تقطير يدوي لمحصول اليوم.', 'Hand pour-over of the day’s crop.', 1900, 5], ['كيمكس', 'Chemex', 'لشخصين، طعم نظيف.', 'For two, clean cup.', 2800, 5], ['كورتادو', 'Cortado', 'إسبريسو مع قليل من الحليب.', 'Espresso cut with a little milk.', 1500, 60]]),
    M('حبوب للبيع', 'Beans to go', [['إثيوبيا يرغاتشيفي 250غ', 'Ethiopia Yirgacheffe 250g', 'زهري مع حمضية الليمون.', 'Floral with lemon acidity.', 7500, 0], ['كولومبيا هويلا 250غ', 'Colombia Huila 250g', 'شوكولاتة وكراميل.', 'Chocolate and caramel.', 6900, 0]]),
  ],
  bakery: [
    M('المخبوزات', 'Bakes', [['كروسان', 'Croissant', 'زبدة فرنسية، يخبز كل صباح.', 'French butter, baked every morning.', 1100, 260], ['خبز العجين المخمر', 'Sourdough loaf', 'تخمير 24 ساعة.', '24-hour ferment.', 2200, 1200], ['سينابون', 'Cinnamon roll', 'بالقرفة وكريمة الجبن.', 'Cinnamon with cream-cheese glaze.', 1500, 420]]),
    M('الكيك', 'Cakes', [['كيكة الشوكولاتة', 'Chocolate cake', 'شريحة.', 'One slice.', 2200, 480], ['تشيز كيك التوت', 'Berry cheesecake', 'شريحة.', 'One slice.', 2400, 430]]),
  ],
  juice: [
    M('العصائر الطازجة', 'Fresh juices', [['برتقال', 'Orange', 'معصور عند الطلب.', 'Squeezed to order.', 1300, 160], ['أفوكادو بالعسل', 'Avocado honey', 'أفوكادو وحليب وعسل.', 'Avocado, milk and honey.', 1900, 380], ['ليمون نعناع', 'Lemon mint', 'منعش ومثلج.', 'Fresh and iced.', 1200, 110]]),
    M('السموذي', 'Smoothies', [['مانجو باشن', 'Mango passion', 'مانجو وفاكهة الباشن.', 'Mango and passion fruit.', 1800, 240], ['بيري بوست', 'Berry boost', 'توت مشكل مع زبادي.', 'Mixed berries with yoghurt.', 1900, 230]]),
  ],
  clinic: [
    M('الكشف', 'Consultations', [['كشف عام', 'General consultation', 'مدة 20 دقيقة.', '20 minutes.', 15000, null], ['كشف استشاري', 'Consultant visit', 'مدة 30 دقيقة.', '30 minutes.', 30000, null]]),
    M('التحاليل', 'Lab tests', [['صورة دم كاملة', 'Complete blood count', 'النتيجة خلال يوم.', 'Result within a day.', 9000, null], ['فيتامين د', 'Vitamin D', 'النتيجة خلال يومين.', 'Result within two days.', 18000, null]]),
  ],
  salon: [
    M('الشعر', 'Hair', [['قص وتصفيف', 'Cut and style', '45 دقيقة.', '45 minutes.', 12000, null], ['صبغة كاملة', 'Full colour', 'تشمل الغسيل والتجفيف.', 'Includes wash and blow-dry.', 35000, null]]),
    M('العناية', 'Care', [['بديكير', 'Pedicure', '40 دقيقة.', '40 minutes.', 9000, null], ['تنظيف بشرة', 'Facial', '60 دقيقة.', '60 minutes.', 22000, null]]),
  ],
};

// Each template: trade wording, colour and theme. Colours pass WCAG AA with white text.
export const TEMPLATES = [
  { id: 'cafe', sector: 'cafe', color: '#5b3a29', theme: { layout: 'cards', corners: 'soft', cover: 'wide' }, menu: 'cafe', ar: ['مقهى محلي', 'دافئ ببطاقات الصور، للمقاهي والكوفي شوب.'], en: ['Neighbourhood café', 'Warm, photo cards, for cafés.'] },
  { id: 'roastery', sector: 'cafe', color: '#1f1a17', theme: { layout: 'list', corners: 'square', cover: 'compact' }, menu: 'roastery', ar: ['محمصة قهوة مختصة', 'أنيق وداكن، للقهوة المختصة وبيع الحبوب.'], en: ['Specialty roastery', 'Dark and sharp, for specialty coffee and beans.'] },
  { id: 'burger', sector: 'restaurant', color: '#b3261e', theme: { layout: 'cards', corners: 'soft', cover: 'wide' }, menu: 'burger', ar: ['مطعم برجر سريع', 'جريء وشهي، للوجبات السريعة.'], en: ['Burger joint', 'Bold and appetising, for fast food.'] },
  { id: 'oriental', sector: 'restaurant', color: '#185345', theme: { layout: 'list', corners: 'soft', cover: 'wide' }, menu: 'restaurant', ar: ['مطعم شرقي', 'أخضر فاخر، للمطاعم الشعبية والمشاوي.'], en: ['Arabic restaurant', 'Rich green, for traditional and grill.'] },
  { id: 'bakery', sector: 'cafe', color: '#8a4b14', theme: { layout: 'cards', corners: 'soft', cover: 'compact' }, menu: 'bakery', ar: ['مخبز وحلويات', 'ناعم ومشرق، للمخابز والكيك.'], en: ['Bakery & cakes', 'Soft and bright, for bakeries.'] },
  { id: 'juice', sector: 'cafe', color: '#1d7a46', theme: { layout: 'cards', corners: 'soft', cover: 'wide' }, menu: 'juice', ar: ['محل عصائر', 'منعش وحيوي، للعصائر والسموذي.'], en: ['Juice bar', 'Fresh and lively, for juices.'] },
  { id: 'clinic', sector: 'clinic', color: '#1b4f8a', theme: { layout: 'list', corners: 'soft', cover: 'compact' }, menu: 'clinic', ar: ['عيادة', 'هادئ وواضح، لقائمة الخدمات وأرقام الانتظار.'], en: ['Clinic', 'Calm and clear, for services and queue numbers.'] },
  { id: 'salon', sector: 'service', color: '#7a2e6b', theme: { layout: 'list', corners: 'soft', cover: 'wide' }, menu: 'salon', ar: ['صالون وعناية', 'راقٍ، لقائمة الخدمات والمواعيد.'], en: ['Salon & care', 'Elegant, for services and bookings.'] },
];

const menuOf = (t) => (t.menu === 'cafe' || t.menu === 'restaurant' ? sampleMenu(t.menu) : MENUS[t.menu]);
const countOf = (t) => menuOf(t).reduce((n, [, , items]) => n + items.length, 0);

export function registerTemplates(app) {
  const owner = requireRole('owner');

  app.get('/api/owner/templates', owner, async (c) => {
    const u = c.get('user');
    const [items, samples] = await Promise.all([
      c.env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE org_id=?').bind(u.org_id).first(),
      c.env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE org_id=? AND is_sample=1').bind(u.org_id).first(),
    ]);
    return c.json({
      menu_empty: !items.n,
      hidden_samples: samples.n,
      templates: TEMPLATES.map((t) => ({
        id: t.id, sector: t.sector, color: t.color, theme: t.theme, items: countOf(t),
        name_ar: t.ar[0], desc_ar: t.ar[1], name_en: t.en[0], desc_en: t.en[1],
        preview: menuOf(t).slice(0, 2).map(([ar, en, list]) => ({ name_ar: ar, name_en: en, items: list.slice(0, 2).map(([a, e, , , p]) => ({ name_ar: a, name_en: e, price: p })) })),
      })),
    });
  });

  app.post('/api/owner/templates/:id/apply', owner, async (c) => {
    const t = TEMPLATES.find((x) => x.id === c.req.param('id'));
    if (!t) throw notFound();
    const u = c.get('user');
    const b = await c.req.json().catch(() => ({}));
    const profile = await c.env.DB.prepare('SELECT theme_json FROM org_profiles WHERE org_id=?').bind(u.org_id).first();
    let current = {};
    try { current = JSON.parse(profile?.theme_json || '{}'); } catch { /* reset */ }
    const theme = { ...DEFAULT_THEME, ...current, ...t.theme };
    const statements = [
      c.env.DB.prepare('UPDATE orgs SET brand_color=? WHERE id=?').bind(t.color, u.org_id),
      c.env.DB.prepare(
        'INSERT INTO org_profiles(org_id,sector,theme_json,updated_at) VALUES(?,?,?,?) ON CONFLICT(org_id) DO UPDATE SET sector=excluded.sector, theme_json=excluded.theme_json, updated_at=excluded.updated_at',
      ).bind(u.org_id, t.sector, JSON.stringify(theme), now()),
    ];
    let added = 0;
    if (b?.with_menu !== false) {
      const existing = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM items WHERE org_id=?').bind(u.org_id).first();
      if (existing.n && b?.with_menu === true) throw conflict('menu_not_empty');
      if (!existing.n) {
        added = countOf(t);
        await assertPlanQuota(c.env, u.org_id, 'items', added);
        menuOf(t).forEach(([catAr, catEn, items], ci) => {
          const cid = id();
          statements.push(c.env.DB.prepare('INSERT INTO categories (id, org_id, name_ar, name_en, sort) VALUES (?, ?, ?, ?, ?)').bind(cid, u.org_id, catAr, catEn, ci));
          items.forEach(([ar, en, dar, den, price, kcal], ii) => statements.push(
            c.env.DB.prepare('INSERT INTO items (id, org_id, category_id, name_ar, name_en, desc_ar, desc_en, price, calories, sort, is_sample) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
              .bind(id(), u.org_id, cid, ar, en, dar, den, price, kcal, ii),
          ));
        });
      }
    }
    await c.env.DB.batch(statements);
    await audit(c.env, u, 'template.apply', { template: t.id, sample_items: added });
    return c.json({ ok: true, template: t.id, sample_items: added });
  });

  // "Show the sample sections": publish all sample items as they are, or remove them.
  app.post('/api/owner/templates/samples/publish', owner, async (c) => {
    const r = await c.env.DB.prepare('UPDATE items SET is_sample=0 WHERE org_id=? AND is_sample=1').bind(c.get('user').org_id).run();
    return c.json({ published: r.meta?.changes ?? 0 });
  });
  app.post('/api/owner/templates/samples/remove', owner, async (c) => {
    const u = c.get('user');
    const r = await c.env.DB.prepare('DELETE FROM items WHERE org_id=? AND is_sample=1').bind(u.org_id).run();
    await c.env.DB.prepare('DELETE FROM categories WHERE org_id=? AND NOT EXISTS (SELECT 1 FROM items i WHERE i.category_id=categories.id)').bind(u.org_id).run();
    return c.json({ removed: r.meta?.changes ?? 0 });
  });
}
