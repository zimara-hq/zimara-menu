/** Local-only logo analysis. Importing this module has no DOM side effects. */
export function colorsFromPixels(rgba) {
  if ((!Array.isArray(rgba) && !ArrayBuffer.isView(rgba)) || !Number.isInteger(rgba.length) || rgba.length % 4) throw new TypeError('Invalid RGBA pixels');
  const buckets = new Map();
  for (let i = 0; i < rgba.length; i += 4) {
    const pixel = Array.from(rgba.slice(i, i + 4));
    if (pixel.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new TypeError('Invalid RGBA pixels');
    const [r, g, b, alpha] = pixel;
    if (!alpha) continue;
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const bucket = buckets.get(key) || { weight: 0, sum: [0, 0, 0] };
    bucket.weight += alpha;
    [r, g, b].forEach((value, channel) => { bucket.sum[channel] += value * alpha; });
    buckets.set(key, bucket);
  }
  const picked = [];
  for (const bucket of [...buckets.values()].sort((a, b) => b.weight - a.weight)) {
    const rgb = bucket.sum.map(value => Math.round(value / bucket.weight));
    if (picked.some(other => Math.hypot(...rgb.map((v, i) => v - other[i])) < 48)) continue;
    picked.push(rgb);
    if (picked.length === 5) break;
  }
  return picked.map(rgb => '#' + rgb.map(value => value.toString(16).padStart(2, '0')).join(''));
}

function luminance(hex) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) throw new TypeError('Expected a six-digit HEX color');
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

export function paletteContrast(fg, bg) {
  const a = luminance(fg), b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Black or white always provides WCAG AA contrast for normal text.
export function readableText(bg) {
  return paletteContrast('#000000', bg) >= paletteContrast('#ffffff', bg) ? '#000000' : '#ffffff';
}

function logoError(code) {
  return Object.assign(new Error(code), { code });
}

function checkDimensions(width, height) {
  if (!width || !height || !Number.isInteger(width) || !Number.isInteger(height)) throw logoError('invalid_logo');
  if (width > 8192 || height > 8192 || width * height > 16_000_000) throw logoError('logo_too_large');
  return { width, height };
}

// Inspect raster headers before decoding so compressed images cannot request unbounded canvases.
function rasterDimensions(bytes, type) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  if (type === 'image/png' && bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) && view.getUint32(8) === 13 && text(12, 4) === 'IHDR') {
    return checkDimensions(view.getUint32(16), view.getUint32(20));
  }
  if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 3 < bytes.length) {
      if (bytes[offset++] !== 255) break;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) return checkDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      offset += length;
    }
  }
  if (type === 'image/webp' && bytes.length >= 25 && text(0, 4) === 'RIFF' && text(8, 4) === 'WEBP' && view.getUint32(4, true) + 8 === bytes.length) {
    const chunk = text(12, 4), size = view.getUint32(16, true);
    if (size + 20 > bytes.length) throw logoError('invalid_logo');
    const uint24 = offset => bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
    if (chunk === 'VP8X' && bytes.length >= 30 && size >= 10) return checkDimensions(uint24(24) + 1, uint24(27) + 1);
    if (chunk === 'VP8 ' && bytes.length >= 30 && size >= 10 && bytes[23] === 157 && bytes[24] === 1 && bytes[25] === 42) return checkDimensions(view.getUint16(26, true) & 16383, view.getUint16(28, true) & 16383);
    if (chunk === 'VP8L' && size >= 5 && bytes[20] === 47) {
      const bits = view.getUint32(21, true);
      return checkDimensions((bits & 16383) + 1, ((bits >>> 14) & 16383) + 1);
    }
  }
  throw logoError('invalid_logo');
}

async function decodeImage(file, width, height) {
  if (typeof globalThis.createImageBitmap === 'function') {
    try { return await globalThis.createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high', imageOrientation: 'none' }); }
    catch { /* Older browsers can decode via a local object URL. */ }
  }
  if (typeof globalThis.Image !== 'function' || typeof globalThis.URL?.createObjectURL !== 'function') throw logoError('invalid_logo');
  const image = new globalThis.Image();
  const url = globalThis.URL.createObjectURL(file);
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(logoError('invalid_logo'));
      image.src = url;
    });
    checkDimensions(image.naturalWidth, image.naturalHeight);
    return image;
  } catch (error) {
    image.removeAttribute('src');
    throw error;
  } finally {
    image.onload = null;
    image.onerror = null;
    globalThis.URL.revokeObjectURL(url);
  }
}

/** PNG/JPEG/WebP only. Returns original dimensions; the local sampling canvas is at most 160×160. */
export async function extractLogoPalette(file) {
  if (file?.size > 4 * 1024 * 1024) throw logoError('file_too_large');
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || typeof file.arrayBuffer !== 'function' || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw logoError('invalid_logo');
  let canvas, decoded;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 4 * 1024 * 1024) throw logoError('file_too_large');
    const { width, height } = rasterDimensions(bytes, file.type);
    const scale = Math.min(1, 160 / width, 160 / height);
    const sampleWidth = Math.max(1, Math.round(width * scale));
    const sampleHeight = Math.max(1, Math.round(height * scale));
    decoded = await decodeImage(file, sampleWidth, sampleHeight);
    checkDimensions(decoded.naturalWidth || decoded.width, decoded.naturalHeight || decoded.height);
    canvas = typeof globalThis.OffscreenCanvas === 'function' ? new globalThis.OffscreenCanvas(sampleWidth, sampleHeight) : globalThis.document?.createElement('canvas');
    if (!canvas) throw logoError('invalid_logo');
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw logoError('invalid_logo');
    context.drawImage(decoded, 0, 0, sampleWidth, sampleHeight);
    const colors = colorsFromPixels(context.getImageData(0, 0, sampleWidth, sampleHeight).data);
    if (!colors.length) throw logoError('logo_no_colors');
    return { colors, width, height, source: 'browser' };
  } catch (error) {
    if (['file_too_large', 'invalid_logo', 'logo_too_large', 'logo_no_colors'].includes(error?.code)) throw error;
    throw logoError('invalid_logo');
  } finally {
    decoded?.close?.();
    if (decoded?.removeAttribute) decoded.removeAttribute('src');
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}
