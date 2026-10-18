// Karaoke-kan: map pins. Prices are images (karaokekan.net/shop2price/…), so the app links to the shop page that shows
// them; a few shops have prices typed in from those images (data/manual-prices.json), and the crawl warns when one of
// those images changes. Shop list: the sitemap's /shop/detail/{id} pages; coordinates from each page's Google Maps embed.
import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { get, text, today } from './common.js';

// The 機種 field lists models after a family label ("JOYSOUND" / "X1 MAX GO MAX2"); names contain spaces, so
// they are matched against known models. Leftover text stops the run, so a new model name gets noticed.
const MODELS = {
  JOYSOUND: /X1|MAX GO|MAX2|MAX|f1|CROSSO|響Ⅱ|響II/g,
  DAM: /LIVE DAM (?:WAO!|AiR|Ai|STADIUM(?: STAGE| DX)?|STAGE)|Premier DAM|CYBER DAM(?: HD)?/g,
};

export function parseShopPage(html) {
  const $ = cheerio.load(html);
  const info = label => $('dt').filter((_, e) => text($(e)) === label).first().next(); // the first block is this shop
  const machines = [];
  const ps = info('機種').find('p').toArray().map(p => $(p));
  ps.forEach((p, i) => {
    const family = text(p);
    if (p.hasClass('text') || !MODELS[family]) return;
    const models = text(ps[i + 1] ?? $()).replace(/LIVE\s*DAM/gi, 'LIVE DAM'); // "LIVEDAM Ai" → "LIVE DAM Ai"
    const found = models.match(MODELS[family]) ?? [];
    const rest = models.replace(MODELS[family], '').trim();
    if (rest) throw new Error(`unknown ${family} model text "${rest}"`);
    machines.push(...found.map(m => (family === 'JOYSOUND' ? `JOYSOUND ${m}` : m)));
  });
  const map = html.match(/!2d(1[2-5]\d\.\d+)!3d(\d{2}\.\d+)/);
  return {
    name: text($('title')).split('|')[0].trim(),
    address: text(info('住所')).replace(/^〒\d{3}-\d{4}\s*/, '') || null,
    hours: text(info('営業時間')) || null,
    lat: map ? +map[2] : null,
    lng: map ? +map[1] : null,
    machines,
    price_images: [...new Set(html.match(/https?:\/\/[^"'\s]+\/shop2price\/image\/[\w/]+/g) ?? [])],
  };
}

export async function crawl({ offline = false } = {}) {
  const sitemap = await get('https://karaokekan.jp/sitemap.xml', 'karaokekan-sitemap.xml', { offline });
  const ids = [...new Set([...sitemap.matchAll(/karaokekan\.jp\/shop\/detail\/(\d+)/g)].map(m => m[1]))];
  if (!ids.length) throw new Error('Karaoke-kan: no shop pages in the sitemap');
  const shops = [], errors = [], images = new Map();
  for (const id of ids) {
    const url = `https://karaokekan.jp/shop/detail/${id}`;
    try {
      const page = parseShopPage(await get(url, `karaokekan-${id}.html`, { offline }));
      shops.push({
        id: `karaokekan-${id}`,
        brand: 'karaokekan',
        name: page.name,
        address: page.address,
        lat: page.lat,
        lng: page.lng,
        hours: page.hours,
        tel: null,
        machines: page.machines,
        rooms: null,
        amenities: null,
        prices: [], // images: not read; hand-entered ones are added by manual.js
        notes: [],
        source_url: url,
        price_url: url,
        prices_as_of: null,
        fetched_at: today(),
      });
      images.set(id, page.price_images);
    } catch (e) { if (!/HTTP 404|ENOENT/.test(e.message)) errors.push(`${url}: ${e.message}`); } // 404 (or never cached because of it): in the sitemap but closed
  }
  return { shops, errors, warnings: offline === true ? [] : await imageChanges(images) };
}

// Hand-entered shops (data/manual-prices.json) keep the SHA-1 of each price image they were typed from. A new, missing
// or changed image means the prices may have changed: warn, so someone re-reads the image and updates the entry.
export async function imageChanges(images) {
  const manual = JSON.parse(readFileSync(new URL('../data/manual-prices.json', import.meta.url), 'utf8'));
  const warnings = [];
  for (const [key, entry] of Object.entries(manual)) {
    const id = key.match(/^karaokekan-(\d+)$/)?.[1];
    if (!id || !entry.images || !images.has(id)) continue;
    const now = images.get(id), typed = Object.keys(entry.images);
    const changed = [...now.filter(u => !typed.includes(u)).map(u => `new ${u}`), ...typed.filter(u => !now.includes(u)).map(u => `gone ${u}`)];
    for (const url of typed.filter(u => now.includes(u))) {
      try {
        const img = await get(url, `karaokekan-price-${id}-${url.split('/').pop()}.jpg`, { binary: true }); // always fresh
        if (createHash('sha1').update(img).digest('hex') !== entry.images[url]) changed.push(`changed ${url}`);
      } catch (e) { changed.push(`unreadable ${url}: ${e.message}`); }
    }
    if (changed.length) warnings.push(`Karaoke-kan ${key}: price image ${changed.join(', ')} — re-check the hand-entered prices (${entry.source})`);
  }
  return warnings;
}
