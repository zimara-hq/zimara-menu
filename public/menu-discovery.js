// Pure discovery: missing nutrition never becomes a zero or a dietary claim.
export function discoverItems(items, categories, filters = {}) {
  const closed = new Set(categories.filter(c => c.scheduled_available === false).map(c => c.id));
  const query = (filters.query || '').trim().toLocaleLowerCase();
  const result = items.filter(i => i.available && !closed.has(i.category_id)
    && (!query || [i.name_ar,i.name_en,i.desc_ar,i.desc_en].filter(Boolean).join(' ').toLocaleLowerCase().includes(query))
    && (!filters.dietary || i.dietary?.includes(filters.dietary))
    && (filters.maxPrice == null || i.price <= filters.maxPrice)
    && (filters.maxCalories == null || (i.calories != null && i.calories <= filters.maxCalories)));
  if (filters.sort === 'popular') result.sort((a,b) => (b.orders_today || 0) - (a.orders_today || 0));
  if (filters.sort === 'price') result.sort((a,b) => a.price - b.price);
  return result;
}
