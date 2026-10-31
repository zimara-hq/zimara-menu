// Ready-made starter menus an owner can add to an empty menu, then edit or delete.
// Prices are in halalas. Calories follow the SFDA requirement to show them per item.
const CAFE = [
  ['القهوة الساخنة', 'Hot coffee', [
    ['إسبريسو', 'Espresso', 'جرعة مركزة من محصول اليوم.', 'A concentrated shot of the day’s roast.', 900, 5],
    ['أمريكانو', 'Americano', 'إسبريسو مع ماء ساخن، طعم نظيف وخفيف.', 'Espresso lengthened with hot water.', 1200, 10],
    ['لاتيه', 'Latte', 'إسبريسو مع حليب مبخّر ورغوة ناعمة.', 'Espresso with steamed milk and light foam.', 1700, 190],
    ['كابتشينو', 'Cappuccino', 'توازن بين الإسبريسو والحليب والرغوة.', 'Equal parts espresso, milk and foam.', 1600, 150],
    ['فلات وايت', 'Flat white', 'جرعة مزدوجة مع حليب مخملي.', 'A double shot with velvety milk.', 1700, 120],
    ['قهوة سعودية', 'Saudi coffee', 'دلة بالهيل والزعفران تقدم مع التمر.', 'A pot with cardamom and saffron, served with dates.', 2500, 10],
  ]],
  ['المشروبات الباردة', 'Cold drinks', [
    ['آيس لاتيه', 'Iced latte', 'إسبريسو مع حليب بارد وثلج.', 'Espresso over cold milk and ice.', 1800, 180],
    ['كولد برو', 'Cold brew', 'منقوعة 18 ساعة، ناعمة وقليلة الحموضة.', 'Steeped 18 hours, smooth and low in acidity.', 1900, 5],
    ['سبانش لاتيه', 'Spanish latte', 'لاتيه بارد بالحليب المكثف المحلى.', 'Iced latte with sweetened condensed milk.', 2100, 260],
    ['ليمون بالنعناع', 'Lemon mint', 'ليمون طازج مع نعناع مثلّج.', 'Fresh lemon blended with mint and ice.', 1500, 120],
  ]],
  ['المخبوزات', 'Bakery', [
    ['كروسان بالزبدة', 'Butter croissant', 'مخبوز يوميًا بزبدة فرنسية.', 'Baked daily with French butter.', 1200, 260],
    ['كروسان زعتر وجبن', 'Zaatar & cheese croissant', 'زعتر بلدي مع جبنة عكاوي.', 'Local zaatar with akkawi cheese.', 1400, 290],
    ['كوكيز الشوكولاتة', 'Chocolate cookie', 'طري من الداخل مع قطع شوكولاتة داكنة.', 'Soft centre with dark chocolate chunks.', 1000, 220],
  ]],
  ['الحلويات', 'Desserts', [
    ['سان سباستيان', 'San Sebastián cheesecake', 'تشيز كيك محروق الوجه بقوام كريمي.', 'Burnt Basque cheesecake with a creamy centre.', 2800, 420],
    ['تيراميسو', 'Tiramisu', 'طبقات بسكويت بالقهوة وكريمة الماسكربوني.', 'Coffee-soaked ladyfingers and mascarpone.', 2600, 380],
    ['كيكة التمر', 'Date cake', 'كيكة دافئة بصوص التوفي.', 'Warm date cake with toffee sauce.', 1800, 310],
  ]],
];

const RESTAURANT = [
  ['المقبلات', 'Starters', [
    ['حمص', 'Hummus', 'حمص بالطحينة وزيت الزيتون.', 'Chickpeas with tahini and olive oil.', 1400, 250],
    ['متبل', 'Moutabal', 'باذنجان مشوي مع الطحينة والرمان.', 'Smoked aubergine with tahini and pomegranate.', 1500, 210],
    ['سمبوسة جبن', 'Cheese sambousa', 'أربع قطع مقرمشة.', 'Four crispy pieces.', 1600, 340],
  ]],
  ['الأطباق الرئيسية', 'Mains', [
    ['كبسة دجاج', 'Chicken kabsa', 'أرز بالبهارات مع دجاج مشوي ودقوس.', 'Spiced rice with roast chicken and daqqus.', 3900, 820],
    ['مندي لحم', 'Lamb mandi', 'لحم مطهو ببطء على أرز مدخن.', 'Slow-cooked lamb on smoked rice.', 5900, 960],
    ['مشاوي مشكلة', 'Mixed grill', 'شيش طاووق وكباب وأوصال مع خبز.', 'Shish tawook, kebab and lamb cubes with bread.', 6400, 1100],
  ]],
  ['البرجر', 'Burgers', [
    ['برجر كلاسيك', 'Classic burger', 'لحم بقري مع جبنة شيدر وصوص البيت.', 'Beef patty, cheddar and house sauce.', 3200, 780],
    ['برجر دجاج مقرمش', 'Crispy chicken burger', 'صدر دجاج مقرمش مع خس ومايونيز حار.', 'Crispy chicken, lettuce and spicy mayo.', 2900, 720],
  ]],
  ['المشروبات', 'Drinks', [
    ['عصير برتقال طازج', 'Fresh orange juice', 'برتقال معصور عند الطلب.', 'Squeezed to order.', 1400, 160],
    ['لبن', 'Laban', 'لبن بارد.', 'Chilled laban.', 600, 120],
    ['مياه', 'Water', '330 مل.', '330 ml.', 300, 0],
  ]],
];

export function sampleMenu(sector) {
  return sector === 'restaurant' ? RESTAURANT : CAFE;
}

export function sampleItemCount(sector) {
  return sampleMenu(sector).reduce((n, [, , items]) => n + items.length, 0);
}

// Statements that insert the sample menu for one organization.
export function sampleMenuStatements(db, orgId, sector, newId) {
  const statements = [];
  sampleMenu(sector).forEach(([catAr, catEn, items], ci) => {
    const cid = newId();
    statements.push(
      db.prepare('INSERT INTO categories (id, org_id, name_ar, name_en, sort) VALUES (?, ?, ?, ?, ?)').bind(cid, orgId, catAr, catEn, ci),
    );
    items.forEach(([ar, en, dar, den, price, kcal], ii) => {
      statements.push(
        db.prepare(
          'INSERT INTO items (id, org_id, category_id, name_ar, name_en, desc_ar, desc_en, price, calories, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        ).bind(newId(), orgId, cid, ar, en, dar, den, price, kcal, ii),
      );
    });
  });
  return statements;
}
