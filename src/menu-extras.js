// Menu depth: before-discount price, allergens, caffeine/sodium, and option groups
// (sizes, extras). The server owns every price: a customer only sends choice ids.
import { bad, int, randomToken, str } from './util.js';

// The 14 allergens of GSO 9 / Codex labelling, which SFDA guidance follows.
export const ALLERGENS = [
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk',
  'tree_nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs',
];

// Item badges a guest sees on the dish card. At most three per item.
export const BADGES = ['new', 'popular', 'chef', 'spicy', 'vegan', 'vegetarian', 'healthy', 'limited'];
const MAX_BADGES = 3;

export function normalizeBadges(v) {
  if (v === undefined || v === null || v === '') return [];
  if (!Array.isArray(v) || v.length > MAX_BADGES) throw bad('invalid_badges');
  const out = [];
  for (const b of v) {
    if (!BADGES.includes(b)) throw bad('invalid_badges');
    if (!out.includes(b)) out.push(b);
  }
  return out;
}

const MAX_GROUPS = 8;
const MAX_CHOICES = 20;
const MAX_DELTA = 1_000_000; // halalas (10,000 SAR)
const ID_RE = /^[A-Za-z0-9_-]{1,24}$/;

const newId = () => randomToken(6).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) || 'opt' + Date.now().toString(36);

function bool(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

export function normalizeAllergens(v) {
  if (v === undefined || v === null || v === '') return [];
  if (!Array.isArray(v) || v.length > ALLERGENS.length) throw bad('invalid_allergens');
  const out = [];
  for (const a of v) {
    if (!ALLERGENS.includes(a)) throw bad('invalid_allergens');
    if (!out.includes(a)) out.push(a);
  }
  return ALLERGENS.filter((a) => out.includes(a));
}

export function normalizeOptions(v) {
  if (v === undefined || v === null || v === '') return [];
  if (!Array.isArray(v) || v.length > MAX_GROUPS) throw bad('invalid_options');
  const groupIds = new Set();
  return v.map((g) => {
    if (!g || typeof g !== 'object') throw bad('invalid_options');
    const gid = g.id && ID_RE.test(g.id) && !groupIds.has(g.id) ? g.id : newId();
    groupIds.add(gid);
    if (!Array.isArray(g.choices) || !g.choices.length || g.choices.length > MAX_CHOICES) throw bad('invalid_options');
    const choiceIds = new Set();
    const choices = g.choices.map((ch) => {
      if (!ch || typeof ch !== 'object') throw bad('invalid_options');
      const cid = ch.id && ID_RE.test(ch.id) && !choiceIds.has(ch.id) ? ch.id : newId();
      choiceIds.add(cid);
      return {
        id: cid,
        name_ar: str(ch.name_ar, 'options', { max: 60 }),
        name_en: str(ch.name_en ?? ch.name_ar, 'options', { max: 60 }),
        price: int(ch.price ?? 0, 'options', { max: MAX_DELTA }),
      };
    });
    const multi = bool(g.multi);
    const required = bool(g.required);
    return {
      id: gid,
      name_ar: str(g.name_ar, 'options', { max: 60 }),
      name_en: str(g.name_en ?? g.name_ar, 'options', { max: 60 }),
      required,
      multi,
      max: multi ? int(g.max ?? choices.length, 'options', { min: 1, max: choices.length }) : 1,
      choices,
    };
  });
}

// Validates the extra item fields and returns them in column order:
// compare_price, allergens, caffeine_mg, sodium_mg, options_json, badges.
export function itemExtras(b, price) {
  const compare = int(b.compare_price, 'compare_price', { optional: true, max: 10_000_000 });
  if (compare !== null && compare <= price) throw bad('invalid_compare_price');
  return [
    compare,
    JSON.stringify(normalizeAllergens(b.allergens)),
    int(b.caffeine_mg, 'caffeine_mg', { optional: true, max: 2000 }),
    int(b.sodium_mg, 'sodium_mg', { optional: true, max: 20000 }),
    JSON.stringify(normalizeOptions(b.options)),
    JSON.stringify(normalizeBadges(b.badges)),
  ];
}

const parse = (s, fallback) => {
  try {
    const v = JSON.parse(s ?? '');
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
};

// Shapes a stored item row for API output.
export function itemView(row) {
  const { options_json, allergens, badges, ...rest } = row;
  return { ...rest, allergens: parse(allergens, []), options: parse(options_json, []), badges: parse(badges, []) };
}

// Resolves a customer's chosen option ids against the stored groups.
// Returns { unit, options } where options lists the picked choices with names.
export function priceWithOptions(item, picked) {
  const groups = parse(item.options_json, []);
  if (picked !== undefined && picked !== null && !Array.isArray(picked)) throw bad('invalid_options');
  const ids = [...new Set(picked || [])];
  if (ids.length > MAX_GROUPS * MAX_CHOICES) throw bad('invalid_options');
  const used = new Set();
  const chosen = [];
  let unit = item.price;
  for (const g of groups) {
    const hits = g.choices.filter((ch) => ids.includes(ch.id));
    if (g.required && hits.length === 0) throw bad('option_required');
    if (hits.length > (g.multi ? g.max : 1)) throw bad('invalid_options');
    for (const ch of hits) {
      used.add(ch.id);
      unit += ch.price;
      chosen.push({ group_ar: g.name_ar, group_en: g.name_en, id: ch.id, name_ar: ch.name_ar, name_en: ch.name_en, price: ch.price });
    }
  }
  if (used.size !== ids.length) throw bad('invalid_options');
  return { unit, options: chosen };
}
