import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { icon } from '../public/icons.js';
import { orderButtons, orderMessage } from '../src/addons.js';

// These are authored runtime sources, not historical migrations, documentation,
// vendor notices, or customer content stored in the database. Copyright and
// registered-trademark text are text symbols, not replacement UI icons.
const emoji = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3\uFE0F\u{1F3FB}-\u{1F3FF}]/u;
const decode = (source) => source
  .replace(/\\u\{([\da-f]+)\}|\\u([\da-f]{4})/gi, (_, wide, narrow) => String.fromCodePoint(parseInt(wide || narrow, 16)))
  .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, decimal) => String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10)))
  .replace(/[©®]/g, '');

test('all system-authored UI and notification sources remain free of emoji', async () => {
  const violations = [];
  for (const directory of ['public', 'src']) {
    const entries = await readdir(new URL(`../${directory}/`, import.meta.url), { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(?:js|html|css|json|svg)$/.test(entry.name)) continue;
      const path = `${entry.parentPath}/${entry.name}`;
      const source = await readFile(path, 'utf8');
      source.split('\n').forEach((line, index) => {
        if (emoji.test(decode(line))) violations.push(`${path}:${index + 1}`);
      });
    }
  }
  assert.deepEqual(violations, [], `Use the authored SVG icon system for UI, and plain labels for notifications:\n${violations.join('\n')}`);
});

test('icons have consistent accessible outline geometry and cannot interpolate arbitrary markup', () => {
  const svg = icon('bell');
  for (const attribute of ['viewBox="0 0 24 24"', 'stroke="currentColor"', 'stroke-width="1.8"', 'aria-hidden="true"', 'focusable="false"']) {
    assert.ok(svg.includes(attribute), attribute);
  }
  assert.equal(icon('<img src=x onerror=alert(1)>'), icon('circle'));
  assert.equal(icon('toString'), icon('circle'));
  assert.ok(!icon('bell', '20" onload="alert(1)').includes('onload'));
  assert.match(icon('bell', Infinity), /width="20"/);
  assert.match(icon('bell', 500), /width="48"/);
  assert.match(icon('bell', -1), /width="12"/);
});

test('notification defaults preserve meaningful status labels as plain text', () => {
  assert.deepEqual(orderButtons('order').inline_keyboard[0].map(button => button.text), ['قبول', 'رفض']);
  const message = orderMessage({ items_json: '[]', total: 0, order_type: 'dine_in', created_at: 1 }, 'فرع', 'https://example.test', { fields: ['items'] });
  assert.ok(message.startsWith('طلب جديد'));
  assert.ok(!emoji.test(message));
  assert.ok(!message.includes('<svg'));
});
