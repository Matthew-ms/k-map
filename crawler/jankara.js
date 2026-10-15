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

const PERIODS_ONLY = ['朝', '昼', '夜', '深夜'];
const stripMachine = name => name.replace(/（.*?）/g, '').trim();
const text = el => el.text().replace(/\s+/g, ' ').trim();

// Fetch with a raw cache so parser fixes can re-run without hitting the site (offline = cache only).
let lastFetch = 0;
async function get(url, file, { offline, headers = {} }) {
  const path = new URL(file, CACHE);
  if (offline) return readFileSync(path, 'utf8');
  await new Promise(r => setTimeout(r, Math.max(0, lastFetch + DELAY_MS - Date.now())));
  lastFetch = Date.now();
  let res;
  for (let attempt = 1; ; attempt++) { // one retry after a network blip or a server error
    try { res = await fetch(url, { headers: { 'User-Agent': UA, ...headers } }); } catch (e) { if (attempt > 1) throw e; }
    if (res?.ok || attempt > 1) break;
    await new Promise(r => setTimeout(r, DELAY_MS * 3));
  }
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

// "最終受付16時※土日祝 15:30" → { last_entry: "16:00", last_entry_alt: { day: "weekend_holiday", time: "15:30" } }
function parseLastEntry(s) {
  const m = s.match(/最終受付\s*(\d{1,2})(?:時|:(\d{2}))/);
  if (!m) return {};
  const out = { last_entry: `${m[1].padStart(2, '0')}:${m[2] ?? '00'}` };
  const alt = s.match(/※\s*(\S+?)\s*(\d{1,2})(?:時|:(\d{2}))/);
  if (alt) {
    if (!DAYS[alt[1]]) throw new Error(`unknown day type "${alt[1]}" in last entry "${s}"`);
    out.last_entry_alt = { day: DAYS[alt[1]], time: `${alt[2].padStart(2, '0')}:${alt[3] ?? '00'}` };
  }
  return out;
}

// Period for a table whose title doesn't name one, from the slot's start hour.
const periodOf = slot => { const h = +slot?.slice(0, 2); return h >= 5 && h < 10 ? '朝' : h >= 10 && h < 19 ? '昼' : h >= 19 && h < 22 ? '夜' : '深夜'; };

function parsePlan(label) {
  if (label.startsWith('30分')) return '30min';
  if (label.includes('フリータイム')) return 'free_time';
  if (label.includes('ナイトパック')) return 'night_pack';
  if (label.includes('パック')) return 'pack'; // e.g. 3時間パック: a fixed price for a fixed length
  throw new Error(`unknown plan "${label}"`);
}

export function parseShopPage(html, hours) {
  const $ = cheerio.load(html);
  const prices = [];
  const PERIOD = /^(朝|昼|夕方|夜|深夜)(.*)$/;

  // A slot's name cell: "30分 <p>開店～19時</p> <p>最終受付16時</p>". In pack tables the cell holds only the
  // time ("10時～21時 <p>最終受付18時</p>") and the name is in the table title ("昼3時間パック").
  function slotInfo(cell, titleName) {
    let name = text(cell.contents().first());
    let ps = cell.find('p').map((_, p) => text($(p))).get();
    let slotText;
    if (/^(開店|\d{1,2}(?:時|:\d{2}))\s*[～〜~]/.test(name)) [slotText, name] = [name, titleName]; // a time range, not "30分"
    else [slotText, ...ps] = ps;
    const cut = slotText?.indexOf('最終受付') ?? -1; // Super Jankara: "10時～19時 最終受付16:30" in one line
    if (cut > 0) { ps.unshift(slotText.slice(cut)); slotText = slotText.slice(0, cut); }
    if (!name) throw new Error(`slot without a name (${slotText})`);
    const note = ps.find(p => p.startsWith('※') && !p.includes('最終受付')); // e.g. ※金土祝前は23時～5時
    return { name, plan: parsePlan(name), slot: parseSlot(slotText ?? '', hours),
      ...parseLastEntry(ps.find(p => p.includes('最終受付')) ?? ''), ...(note ? { slot_note: note } : {}) };
  }

  // One day row: its label (平日 / 土日祝 …) and one price cell per customer column.
  function addRow(base, cols, dayLabel, cells) {
    const day = DAYS[dayLabel];
    if (!day) throw new Error(`unknown day type "${dayLabel}"`);
    if (cells.length !== cols.length) throw new Error(`${cells.length} prices for ${cols.length} columns (${base.name} ${base.slot} ${dayLabel})`);
    cells.each((i, el) => {
      const yen = parseInt($(el).find('.fontPrice').text().replace(/,/g, ''), 10);
      const row = { ...base, day, customer: cols[i], yen: Number.isNaN(yen) ? null : yen };
      if (row.yen === null) row.text = text($(el)) || null; // no number on the site: keep its exact words (e.g. "-")
      prices.push(row);
    });
  }
  const columns = (els, where) => {
    const cols = els.map((_, e) => CUSTOMERS[text($(e))]).get();
    if (!cols.length || cols.includes(undefined)) throw new Error(`unexpected price columns: ${where}`);
    return cols; // usually all five; some shops list only 会員 / 一般
  };

  // Standard layout: <table> per period, rows per slot × day type.
  $('.price_table_area table').each((_, table) => {
    const t = $(table);
    const party = t.closest('#price-special').length ? 'solo' : 'group'; // #price-special = 1人料金表
    const title = t.find('.price_title');
    const drinks = text(title).includes('ドリンク飲み放題');
    const titleText = text(title.contents().filter((_, n) => n.type === 'text'));
    let [, period, titleName] = titleText.match(PERIOD) ?? [null, null, titleText]; // "昼3時間パック" → 昼 + 3時間パック
    if (!titleName && !period) throw new Error(`unknown price table title "${text(title)}"`);
    const cols = columns(t.find('th.attribute'), text(t.find('thead')));
    let base;
    t.find('tr').not('.price_name').each((_, tr) => {
      const row = $(tr);
      const time = row.find('td.price_time');
      if (time.length) {
        const info = slotInfo(time, titleName);
        base = { party, period: period ?? periodOf(info.slot), ...info, drinks_included: drinks }; // e.g. エンドレスフリータイム has no period in its title
      }
      addRow(base, cols, text(row.find('td.wd, td.hd')), row.find('td.price'));
    });
  });

  // Super Jankara layout: a grid of boxes per slot (.sjkprice__wrapper), weekday prices then holiday prices.
  let sjkPeriod;
  $('.sjkprice__wrapper.price_table').each((_, w) => {
    const box = $(w);
    const title = text(box.children('.sjkprice__header--title').children('span').first());
    if (PERIODS_ONLY.includes(title)) sjkPeriod = title; // free-time boxes carry their own name, not the period
    if (!sjkPeriod) throw new Error(`price box before any period title ("${title}")`);
    const body = box.children('.sjkprice__body');
    const cols = columns(body.find('.sjkprice__wrapper--header .sjkprice__cell'), title);
    const drinks = text(box).includes('ドリンク飲み放題');
    body.children('.sjkprice__wrapper--course').each((_, c) => {
      const course = $(c);
      const base = { party: box.closest('#price-special').length ? 'solo' : 'group', period: sjkPeriod, ...slotInfo(course.children().first(), ''), drinks_included: drinks };
      const days = course.children('[class*="sjkprice__cell--blue"], [class*="sjkprice__cell--pink"]').map((_, d) => text($(d))).get();
      const cells = course.next('.sjkprice__wrapper--price').children('[class*="sjkprice__cell--price"]');
      if (days.length * cols.length !== cells.length) throw new Error(`${cells.length} price boxes for ${days.length} days × ${cols.length} columns (${base.name})`);
      days.forEach((d, i) => addRow(base, cols, d, cells.slice(i * cols.length, (i + 1) * cols.length)));
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

// Area ids from the shop index (jankara.ne.jp/shop/ links to /shop/result/?a={n}).
export async function listAreas({ offline = false } = {}) {
  const html = await get('https://jankara.ne.jp/shop/', 'jankara-index.html', { offline });
  const ids = [...new Set([...html.matchAll(/result\/\?a=(\d+)/g)].map(m => +m[1]))].sort((a, b) => a - b);
  if (!ids.length) throw new Error('no areas found on jankara.ne.jp/shop/');
  return ids;
}

// Jankara's own list of machine models, suffixes stripped. Used to tell a new model from a parse error.
export async function knownMachines({ offline = false } = {}) {
  return JSON.parse(await get('https://jankara.ne.jp/api/machine/', 'jankara-machines.json', { offline })).map(m => stripMachine(m.machineName));
}

// Returns { shops, errors }: one shop's surprise doesn't hide the others.
export async function crawlArea(area, { offline = false } = {}) {
  const list = JSON.parse(await get(`https://jankara.ne.jp/shop/ajax/?a=${area}`, `jankara-area-${area}.json`, {
    offline, headers: { 'X-Requested-With': 'XMLHttpRequest' }, // without this the URL serves an HTML page
  }));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // YYYY-MM-DD, Japan date
  const shops = [], errors = [];
  for (const s of list.filter(s => s.closeShopFlag === '0' && s.is_published !== 'FALSE')) {
    const url = `https://jankara.ne.jp/shop/${s.shopId}/`;
    // Some shops list hours per day ("月〜木…11:00〜5:00|金祝前…11:00〜終日|…"): 開店/閉店 in slots use the first
    // listed hours; the page's own "※土日祝は…" remarks are kept as slot_note, and the card shows the full text.
    const hours = s.shopOpen === '24時間営業' ? '24h' : s.shopOpen.replace(/〜/g, '-').replace(/\|/g, ' / ');
    const slotHours = s.shopOpen === '24時間営業' ? '24h' : s.shopOpen.split('|')[0].split('…').pop().replace(/（.*?）/g, '').replace('〜', '-'); // "11:00〜5:00（土日祝8:00〜）" → 11:00-5:00
    let page;
    try { page = parseShopPage(await get(url, `jankara-${s.shopId}.html`, { offline }), slotHours); }
    catch (e) { errors.push(`${url} (${s.shopName}): ${e.message}`); continue; }
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
  return { shops, errors };
}
