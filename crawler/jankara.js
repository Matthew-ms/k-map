// Jankara: the area shop list is a JSON endpoint (the /shop/result/ HTML only holds a stale image map).
// Prices, rooms and some amenities come from each shop page /shop/{id}/.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as cheerio from 'cheerio';

export const UA = 'K-map/0.1 (+https://github.com/Matthew-ms/k-map)';
const CACHE = new URL('./cache/', import.meta.url);
const DELAY_MS = 3000;

const PREFS = ',北海道,青森県,岩手県,宮城県,秋田県,山形県,福島県,茨城県,栃木県,群馬県,埼玉県,千葉県,東京都,神奈川県,新潟県,富山県,石川県,福井県,山梨県,長野県,岐阜県,静岡県,愛知県,三重県,滋賀県,京都府,大阪府,兵庫県,奈良県,和歌山県,鳥取県,島根県,岡山県,広島県,山口県,徳島県,香川県,愛媛県,高知県,福岡県,佐賀県,長崎県,熊本県,大分県,宮崎県,鹿児島県,沖縄県'.split(',');
const CUSTOMERS = { 学生会員: 'student_member', 学生: 'student', 会員: 'member', シニア: 'senior', 一般: 'general' };
const DAYS = { 平日: 'weekday', 土日祝: 'weekend_holiday', 金土日祝祝前: 'fri_sun_hol_eve', 金土祝前: 'fri_sat_hol_eve', 日祝: 'sun_holiday' };

const stripMachine = name => name.replace(/（.*?）/g, '').trim();
const text = el => el.text().replace(/\s+/g, ' ').trim();

// Fetch with a raw cache so parser fixes can re-run without hitting the site (offline = cache only).
let lastFetch = 0;
async function get(url, file, { offline, headers = {} }) {
  const path = new URL(file, CACHE);
  if (offline) return readFileSync(path, 'utf8');
  await new Promise(r => setTimeout(r, Math.max(0, lastFetch + DELAY_MS - Date.now())));
  lastFetch = Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const body = await res.text();
  if (!existsSync(CACHE)) mkdirSync(CACHE);
  writeFileSync(path, body);
  return body;
}

// "8時～10時" / "6:30～10時" → "08:00-10:00"; 開店/閉店 (open/close) come from the shop hours, e.g. "11:00-5:00"
function parseSlot(s, hours) {
  const [open, close] = /^\d/.test(hours) ? hours.split('-') : [];
  s = s.replace('開店', open ?? '?').replace('閉店', close ?? '?');
  const t = [...s.matchAll(/(\d{1,2})(?:時|:(\d{2}))/g)].map(m => `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`);
  return t.length === 2 ? `${t[0]}-${t[1]}` : null;
}

function parsePlan(label) {
  if (label.startsWith('30分')) return '30min';
  if (label.includes('フリータイム')) return 'free_time';
  if (label.includes('ナイトパック')) return 'night_pack';
  throw new Error(`unknown plan "${label}"`);
}

export function parseShopPage(html, hours) {
  const $ = cheerio.load(html);
  const prices = [];
  $('.price_table_area table').each((_, table) => {
    const t = $(table);
    const party = t.closest('#price-special').length ? 'solo' : 'group'; // #price-special = 1人料金表
    const title = t.find('.price_title');
    const drinks = text(title).includes('ドリンク飲み放題');
    const period = text(title.contents().filter((_, n) => n.type === 'text')); // 朝 / 昼 / 夜 / 深夜
    const cols = t.find('th.attribute').map((_, th) => CUSTOMERS[text($(th))]).get();
    if (cols.length !== 5 || cols.includes(undefined)) throw new Error(`unexpected price columns: ${text(t.find('thead'))}`);
    let plan, slot, name;
    t.find('tr').not('.price_name').each((_, tr) => {
      const row = $(tr);
      const time = row.find('td.price_time');
      if (time.length) {
        name = text(time.contents().first()); // the site's own row name: 30分, ショートフリータイム, ナイトパック…
        plan = parsePlan(name);
        slot = parseSlot(text(time.find('p').first()), hours);
      }
      const dayLabel = text(row.find('td.wd, td.hd'));
      const day = DAYS[dayLabel];
      if (!day) throw new Error(`unknown day type "${dayLabel}"`);
      const cells = row.find('td.price');
      if (cells.length !== cols.length) throw new Error(`${cells.length} prices for ${cols.length} columns (${plan} ${slot} ${dayLabel})`);
      cells.each((i, td) => {
        const yen = parseInt($(td).find('.fontPrice').text().replace(/,/g, ''), 10);
        const row = { party, period, name, plan, slot, day, customer: cols[i], yen: Number.isNaN(yen) ? null : yen, drinks_included: drinks };
        if (row.yen === null) row.text = text($(td)) || null; // no number on the site: keep its exact words (e.g. "-")
        prices.push(row);
      });
    });
  });

  const amenity = alt => {
    const v = text($(`.room_info img[alt="${alt}"]`).closest('dl').find('dd'));
    return v === '' ? null : v;
  };
  const yesNo = v => (v === 'あり' ? true : v === 'なし' ? false : null);

  const featured = $('#room_slide > li').map((_, li) => {
    const cap = text($(li).find('.caption'));
    const m = cap.match(/^(\S+?)号室\s*(.+?)\((\d+)〜(\d+)名\)／(.+)$/);
    if (!m) return null;
    return { no: m[1], type: m[2].trim(), capacity: `${m[3]}-${m[4]}`, machine: stripMachine(m[5]),
      surcharge: text($(li).find('.concept_warning_txt p').first()) || null };
  }).get();

  const body = $('body').text();
  const asOf = body.match(/表示価格は\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
  const notes = [text($('#price-special .info__price')), ...$('.price-bottom-comment small, p.price_note').map((_, e) => text($(e))).get()]
    .filter(Boolean);

  return {
    prices,
    prices_as_of: asOf ? `${asOf[1]}-${asOf[2].padStart(2, '0')}-${asOf[3].padStart(2, '0')}` : null,
    rooms: {
      total: +body.match(/全\s*(\d+)\s*室/)?.[1] || null,
      concept: parseInt(amenity('コンセプトルーム'), 10) || (amenity('コンセプトルーム') === 'なし' ? 0 : null),
      featured,
    },
    smoking_space: yesNo(amenity('喫煙スペース')),
    kids_room: yesNo(amenity('キッズルーム')),
    notes: [...new Set(notes)],
  };
}

export async function crawlArea(area, { offline = false } = {}) {
  const list = JSON.parse(await get(`https://jankara.ne.jp/shop/ajax/?a=${area}`, `jankara-area-${area}.json`, {
    offline, headers: { 'X-Requested-With': 'XMLHttpRequest' }, // without this the URL serves an HTML page
  }));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // YYYY-MM-DD, Japan date
  const shops = [];
  for (const s of list.filter(s => s.closeShopFlag === '0')) {
    const url = `https://jankara.ne.jp/shop/${s.shopId}/`;
    const hours = s.shopOpen === '24時間営業' ? '24h' : s.shopOpen.replace('〜', '-');
    let page;
    try { page = parseShopPage(await get(url, `jankara-${s.shopId}.html`, { offline }), hours); }
    catch (e) { throw new Error(`${url} (${s.shopName}): ${e.message}`); }
    shops.push({
      id: `jankara-${s.shopId}`,
      brand: 'jankara',
      name: s.shopName,
      address: [PREFS[+s.shopPref] ?? '', s.shopAddress, ' ', s.shopBuilding.split('|')[0]].join('').trim(),
      lat: +s.shopLatitude,
      lng: +s.shopLongitude,
      hours,
      tel: s.shopTel || null,
      machines: s.machines.map(m => stripMachine(m.machineName)),
      rooms: { ...page.rooms, total: page.rooms.total ?? (+s.shopRoom || null) },
      // kids_room from the page: the JSON's shopKidsRoom disagrees with it
      amenities: { smoking_space: page.smoking_space, kids_room: page.kids_room,
        no_smoking_room: s.shopNoSmokeRoom === '1', big_room: s.shopBigRoom === '1' },
      store_type: s.store_type || null,
      prices: page.prices,
      notes: page.notes,
      source_url: url,
      prices_as_of: page.prices_as_of,
      fetched_at: today,
    });
  }
  return shops;
}
