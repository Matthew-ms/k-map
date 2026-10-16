// Manekineko: map pins only. Each shop's prices are a PDF under /wp-content/uploads/, which robots.txt asks crawlers
// not to fetch, so the app links to the PDF instead of reading it.
// Shop list: the site's own "もっとみる" request (admin-ajax loc_load_more), one request per prefecture.
// Coordinates, machines and the PDF link: each shop page.
import * as cheerio from 'cheerio';
import { get, text, today, normalizeMachine, isMachine } from './common.js';

const BASE = 'https://www.karaokemanekineko.jp';

export function parseShopPage(html) {
  const $ = cheerio.load(html);
  const m = html.match(/(?:lat|latitude)["'\s:=]+(3\d\.\d+)[\s\S]{0,80}?(?:lng|lon|longitude)["'\s:=]+(1[2-5]\d\.\d+)/i)
    ?? html.match(/maps[^"']{0,120}?(\d{2}\.\d{4,})(?:,|%2C)(1[2-5]\d\.\d{4,})/);
  const machines = $('dt').filter((_, e) => text($(e)) === '取扱機種').first().nextAll('.storeDetail__info__device').first()
    .find('img').toArray().map(i => normalizeMachine($(i).attr('alt') ?? '')).filter(isMachine);
  return {
    lat: m ? +m[1] : null,
    lng: m ? +m[2] : null,
    machines: [...new Set(machines)],
    price_url: $('a').filter((_, a) => text($(a)).includes('料金表をみる')).first().attr('href') ?? null,
  };
}

export async function crawl({ offline = false } = {}) {
  const index = await get(`${BASE}/locations/`, 'manekineko-index.html', { offline });
  const prefs = [...new Set([...index.matchAll(/<option[^>]*value="([a-z]+)"/g)].map(m => m[1]))];
  const nonce = index.match(/"nonce":"([0-9a-f]+)"/)?.[1];
  if (!prefs.length || !nonce) throw new Error('Manekineko: no prefecture list or nonce on /locations/');
  const shops = [], errors = [];
  for (const pref of prefs) {
    // The server caps a page (Tokyo didn't fit in one), so follow has_more.
    let html = '';
    try {
      for (let page = 1; page <= 20; page++) {
        const body = new URLSearchParams({ action: 'loc_load_more', nonce, pref, city: '', q: '', mode: 'gps', lat: '', lng: '', page: String(page), per_page: '200' });
        const list = JSON.parse(await get(`${BASE}/wpcore/wp-admin/admin-ajax.php`, `manekineko-list-${pref}-${page}.json`, {
          offline, method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }));
        if (!list.success) throw new Error('list request refused');
        html += list.data.html;
        if (!list.data.has_more) break;
        if (page === 20) throw new Error('more than 20 list pages');
      }
    } catch (e) { errors.push(`Manekineko ${pref}: ${e.message}`); continue; }
    const $ = cheerio.load(html);
    for (const card of $('.js-store').toArray().map(c => $(c))) {
      const url = card.find('a[href*="/locations/"]').first().attr('href')?.split('?')[0];
      const name = text(card.find('.content__unit-ttl__branch'));
      try {
        if (!url || !name) throw new Error('card without a link or name');
        const slug = url.split('/').filter(Boolean).pop();
        const page = parseShopPage(await get(url, `manekineko-${slug}.html`, { offline }));
        shops.push({
          id: `manekineko-${slug}`,
          brand: 'manekineko',
          name,
          address: text(card.find('.content__unit-address')).replace(/^(\S+[都道府県]) (\S+?[市区町村郡]) /, '$1$2'),
          lat: page.lat,
          lng: page.lng,
          hours: text(card.find('.content__unit-openTime')).replace('24時間営業', '24h') || null,
          tel: null,
          machines: page.machines,
          rooms: null,
          amenities: null,
          prices: [], // not read: see the note at the top
          notes: [],
          source_url: url,
          price_url: page.price_url ?? url,
          prices_as_of: null,
          fetched_at: today(),
        });
      } catch (e) { errors.push(`${url ?? '?'} (まねきねこ ${name}): ${e.message}`); }
    }
  }
  return { shops, errors };
}
