import { api, esc, lang, makeT, money, pick, setBrandColor, topbar } from './common.js';

const t = makeT({
  ar: { search: 'ابحث في المنيو', soldout: 'نفد', kcal: '{n} سعرة', notFound: 'ما لقينا هذا المنيو.', empty: 'ما فيه أصناف مطابقة.', loyalty: 'بطاقة الولاء' },
  en: { search: 'Search the menu', soldout: 'Sold out', kcal: '{n} kcal', notFound: 'Menu not found.', empty: 'No matching items.', loyalty: 'Loyalty card' },
});
const slug = location.pathname.split('/')[2];
const main = document.getElementById('main');

let data;
let q = '';

function render() {
  const items = data.items.filter((i) => !q || (i.name_ar + ' ' + i.name_en + ' ' + i.desc_ar + ' ' + i.desc_en).toLowerCase().includes(q));
  const cats = data.categories.filter((c) => items.some((i) => i.category_id === c.id));
  main.querySelector('#list').innerHTML = cats.length
    ? cats
        .map(
          (c) => `<section id="c-${esc(c.id)}"><h2>${esc(pick(c, 'name'))}</h2><div class="grid">${items
            .filter((i) => i.category_id === c.id)
            .map(
              (i) => `<article class="item ${i.available ? '' : 'soldout'}">
                ${i.image_url ? `<img src="${esc(i.image_url)}" alt="" loading="lazy" width="96" height="96">` : ''}
                <div><h4>${esc(pick(i, 'name'))}</h4>
                <p class="small muted">${esc(pick(i, 'desc'))}</p>
                <p><span class="price">${esc(money(i.price))}</span>
                ${i.calories != null ? ` · <span class="small muted">${esc(t('kcal', { n: i.calories }))}</span>` : ''}
                ${i.available ? '' : ` · <span class="pill">${esc(t('soldout'))}</span>`}</p></div></article>`,
            )
            .join('')}</div></section>`,
        )
        .join('')
    : `<p class="empty">${esc(t('empty'))}</p>`;
}

try {
  data = await api('/api/public/menu/' + slug);
  setBrandColor(data.branch.brand_color);
  const name = lang === 'ar' ? data.branch.org_name_ar : data.branch.org_name_en;
  topbar(document.getElementById('top'), t, { subtitle: `${name} · ${pick(data.branch, 'name')}` });
  document.title = `${name} · ${t('brand')}`;
  main.className = 'wrap';
  main.innerHTML = `
    <label class="visually-hidden" for="q">${esc(t('search'))}</label>
    <input id="q" type="search" placeholder="${esc(t('search'))}" style="margin-top:16px">
    <nav class="menu-cats">${data.categories.map((c) => `<a href="#c-${esc(c.id)}">${esc(pick(c, 'name'))}</a>`).join('')}</nav>
    <div id="list" class="stack"></div>
    <p style="text-align:center"><a class="btn ghost" href="/j/${esc(data.branch.org_slug)}">${esc(t('loyalty'))}</a></p>`;
  main.querySelector('#q').addEventListener('input', (e) => {
    q = e.target.value.trim().toLowerCase();
    render();
  });
  render();
} catch {
  topbar(document.getElementById('top'), t);
  main.innerHTML = `<p class="msg error wrap">${esc(t('notFound'))}</p>`;
}
