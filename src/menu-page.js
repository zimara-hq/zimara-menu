import { initialMenuImages } from '../public/menu-discovery.js';

const BOOTSTRAP_LIMIT = 256 * 1024;
const escapeJSON = value => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
const attr = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function preloads(data) {
  let head=initialMenuImages(data).map((image,index)=>`<link rel="preload" as="image" ${index===0?'data-menu-first-image':'data-menu-image'} href="${attr(image.src)}"${index===0?' fetchpriority="high"':''}${image.srcset?` imagesrcset="${attr(image.srcset)}" imagesizes="${attr(image.sizes)}"`:''}>`).join('');
  const recipe = data.design, profile = data.profile_data?.profile;
  const defaults = !recipe && !['custom', 'system'].includes(profile?.theme?.font);
  if (defaults || recipe?.font_ar === 'tajawal') head += '<link rel="preload" as="font" href="/fonts/menu-tajawal.woff2" type="font/woff2" crossorigin>';
  if (defaults || recipe?.font_en === 'jakarta') head += '<link rel="preload" as="font" href="/fonts/menu-jakarta-core.woff2" type="font/woff2" crossorigin>';
  return head;
}

export async function menuPage(env, request, slug, loadMenu) {
  const headers = new Headers(request.headers);
  headers.delete('if-none-match');
  headers.delete('if-modified-since');
  const shellRequest = new Request(new URL('/menu', request.url), { method: request.method, headers });
  const [response, data] = await Promise.all([
    env.ASSETS.fetch(shellRequest),
    loadMenu(env, slug).catch(() => null),
  ]);
  if (response.status !== 200 || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) return response;
  let html = await response.text();
  const payload=data?.branch?.slug===slug?escapeJSON(data):null;
  if (payload && new TextEncoder().encode(payload).length <= BOOTSTRAP_LIMIT) {
    html = html.replace(/<\/head>/i, () => `${preloads(data)}<script type="application/json" id="menu-bootstrap">${payload}</script></head>`);
  }
  const outputHeaders = new Headers(response.headers);
  for (const name of ['etag', 'content-length', 'content-encoding', 'last-modified']) outputHeaders.delete(name);
  for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Cloudflare-CDN-Cache-Control']) outputHeaders.set(name, 'no-store');
  return new Response(html, { status: response.status, statusText: response.statusText, headers: outputHeaders });
}
