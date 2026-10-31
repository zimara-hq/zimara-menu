import { bad } from './util.js';

export const DEFAULT_THEME = Object.freeze({
  layout: 'list', corners: 'soft', cover: 'wide', font: 'tajawal',
  show_images: true, show_calories: true,
});

// Finite presentation choices, never arbitrary CSS or executable markup.
export function validateTheme(value, current = DEFAULT_THEME) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad('invalid_theme');
  const choices = { layout: ['list', 'cards'], corners: ['soft', 'square'], cover: ['wide', 'compact'], font: ['tajawal', 'system', 'custom'] };
  const next = { ...DEFAULT_THEME, ...current };
  for (const [key, v] of Object.entries(value)) {
    if (Object.hasOwn(choices, key)) {
      if (!choices[key].includes(v)) throw bad('invalid_theme_' + key);
    } else if (key === 'show_images' || key === 'show_calories') {
      if (typeof v !== 'boolean') throw bad('invalid_theme_' + key);
    } else throw bad('invalid_theme');
    next[key] = v;
  }
  return next;
}
