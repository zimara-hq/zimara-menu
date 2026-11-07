import test from 'node:test';
import assert from 'node:assert/strict';
import { colorsFromPixels, paletteContrast, readableText, extractLogoPalette } from '../public/brand-palette.js';

test('transparent pixels never enter the palette; monochrome remains one color', () => {
  assert.deepEqual(colorsFromPixels(new Uint8ClampedArray([255, 0, 0, 0, 12, 34, 56, 255, 12, 34, 56, 255])), ['#0c2238']);
  assert.deepEqual(colorsFromPixels([0, 0, 0, 0]), []);
});

test('dominant colors lead, similar shades deduplicate, and output is bounded HEX', () => {
  const pixels = [...Array.from({ length: 10 }, () => [255, 0, 0, 255]).flat(), 254, 1, 1, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255, 0, 0, 0, 255];
  const colors = colorsFromPixels(pixels);
  assert.equal(colors[0], '#ff0000');
  assert.equal(colors.length, 5);
  assert.equal(new Set(colors).size, 5);
  assert.ok(colors.every(color => /^#[0-9a-f]{6}$/.test(color)));
  assert.deepEqual(colorsFromPixels([31, 31, 31, 255, 32, 32, 32, 255]), ['#1f1f1f']);
});

test('contrast follows WCAG and readable text covers saturated colors and midtones', () => {
  assert.equal(paletteContrast('#000000', '#ffffff'), 21);
  assert.equal(paletteContrast('#ff0000', '#ff0000'), 1);
  assert.ok(Math.abs(paletteContrast('#777777', '#ffffff') - 4.478089453577214) < 0.00001);
  for (const background of ['#777777', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#000000', '#ffffff']) {
    assert.ok(['#000000', '#ffffff'].includes(readableText(background)));
    assert.ok(paletteContrast(readableText(background), background) >= 4.5);
  }
});

test('invalid pixel and color input is rejected', () => {
  for (const pixels of [null, {}, [1], [0, 0, NaN, 255], [256, 0, 0, 255], [-1, 0, 0, 0]]) assert.throws(() => colorsFromPixels(pixels), TypeError);
  for (const color of [null, 'red', '#fff', '#gg0000']) assert.throws(() => paletteContrast(color, '#ffffff'), TypeError);
});

test('browser extraction rejects oversize files and non-raster or mismatched signatures before decoding', async () => {
  await assert.rejects(extractLogoPalette({ size: 4 * 1024 * 1024 + 1, type: 'image/png' }), { code: 'file_too_large' });
  await assert.rejects(extractLogoPalette(new Blob(['<svg></svg>'], { type: 'image/svg+xml' })), { code: 'invalid_logo' });
  await assert.rejects(extractLogoPalette(new Blob(['not an image'], { type: 'image/png' })), { code: 'invalid_logo' });
});

function pngHeader(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([73, 72, 68, 82], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return new Blob([bytes], { type: 'image/png' });
}

test('oversized dimensions and excessive pixel counts are rejected before decoder use', async () => {
  await assert.rejects(extractLogoPalette(pngHeader(9000, 1)), { code: 'logo_too_large' });
  await assert.rejects(extractLogoPalette(pngHeader(5000, 5000)), { code: 'logo_too_large' });
  await assert.rejects(extractLogoPalette(pngHeader(0, 1)), { code: 'invalid_logo' });
});

test('browser adapter samples bounded dimensions and releases bitmap and canvas on every path', async t => {
  const canvases = [];
  let closed = 0, options, mode = 'ok';
  const originalBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap');
  const originalCanvas = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
  t.after(() => {
    for (const [key, descriptor] of [['createImageBitmap', originalBitmap], ['OffscreenCanvas', originalCanvas]]) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  globalThis.createImageBitmap = async (_file, settings) => {
    options = settings;
    return { width: settings.resizeWidth, height: settings.resizeHeight, close() { closed++; } };
  };
  class Canvas {
    constructor(width, height) { this.width = width; this.height = height; canvases.push(this); }
    getContext() {
      return {
        drawImage() { if (mode === 'draw_error') throw new Error('decode error'); },
        getImageData() { return { data: mode === 'empty' ? [0, 0, 0, 0] : [255, 0, 0, 255] }; }
      };
    }
  }
  globalThis.OffscreenCanvas = Canvas;
  assert.deepEqual(await extractLogoPalette(pngHeader(1000, 500)), { colors: ['#ff0000'], width: 1000, height: 500, source: 'browser' });
  assert.equal(options.resizeWidth, 160);
  assert.equal(options.resizeHeight, 80);
  mode = 'empty';
  await assert.rejects(extractLogoPalette(pngHeader(2, 2)), { code: 'logo_no_colors' });
  mode = 'draw_error';
  await assert.rejects(extractLogoPalette(pngHeader(2, 2)), { code: 'invalid_logo' });
  assert.equal(closed, 3);
  assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});
