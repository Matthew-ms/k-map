// Big Echo: the shop list (with coordinates) comes from the store locator at shop.big-echo.jp;
// prices come from each shop page's HTML tables. Pages are written by hand per shop, so the reader goes by rules,
// not exact spellings: the time range is found anywhere in a table's heading, day columns are read as sets of days,
// and a table it can't place is skipped and reported, never guessed.
import * as cheerio from 'cheerio';
import { existsSync, readFileSync } from 'node:fs';
import { get, text as rawText, today, periodOf, parseSlot, normalizeMachine, isMachine } from './common.js';

// NFKC: half-width katakana ("ﾌﾘｰﾀｲﾑ") and full-width digits ("３０分", "１８：００") become ordinary characters.
const text = el => rawText(el).normalize('NFKC');

const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const JDOW = '日月火水木金土';
const TIME_RANGE = /(OPEN|開店|\d{1,2}(?:時|[:：]\d{2}))\s*[〜～~\-－]\s*(CLOSE|閉店|翌?\d{1,2}(?:時|[:：]\d{2}))/i;
const NOT_ROOM_PRICES = /パーティー|コース|学得|宴会|中高生/; // party courses, school-student packs: not room-time prices

// "月～金・祝前日" → Set{mon…fri, eve}; "日～木・祝日" → Set{sun…thu, hol}. Not a day label → null.
export function dayTokens(label) {
  // "(平日)" is a remark; other brackets list days: "金～日（祝日・祝前日）"
  let s = label.replace(/[\s　]/g, '').replace(/[（(]平日[)）]/g, '').replace(/[（()）]/g, '・').replace(/[･·]/g, '・').replace(/[〜~\-－]/g, '～')
    .replace(/曜日?/g, '').replace(/祝祭日/g, '祝日').replace(/平日/g, '月～金');
  if (/^(全日|毎日)$/.test(s)) return new Set(DOW);
  const set = new Set();
  s = s.replace(/祝前日?/g, () => (set.add('eve'), '')).replace(/祝日?/g, () => (set.add('hol'), ''));
  s = s.replace(/([日月火水木金土])～([日月火水木金土])/g, (_, a, b) => {
    for (let i = JDOW.indexOf(a); ; i = (i + 1) % 7) { set.add(DOW[i]); if (i === JDOW.indexOf(b)) break; }
    return '';
  }).replace(/[日月火水木金土]/g, c => (set.add(DOW[JDOW.indexOf(c)]), ''));
  return set.size && /^[・、/]*$/.test(s) ? set : null;
}
const isWeekdaySide = set => ['mon', 'tue', 'wed', 'thu'].every(d => set.has(d)); // the "平日" column; the other one defines the special days

function customerOf(label) {
  if (/ひとり|お一人|1名/.test(label)) return { party: 'solo', customer: 'member' }; // ひとりカラオケ(会員の場合)
  const c = /学割|学生/.test(label) ? 'student' : /シニア/.test(label) ? 'senior' : /会員/.test(label) ? 'member' : /一般/.test(label) ? 'general' : null;
  if (!c) throw new Error(`unknown customer row "${label}"`);
  return { party: 'group', customer: c };
}

// hours: the shop's Monday hours ("10:00-5:00") for OPEN / CLOSE.
export function parseShopPage(html, hours) {
  const $ = cheerio.load(html);
  if (!$('.shop-detail').length) throw new Error('not a shop page');
  const prices = [], notes = new Set(), skipped = [];
  let section = '', title = '';
  $('.price').find('h3, h4, table').each((_, el) => {
    if (el.tagName === 'h3') { section = text($(el)); title = ''; return; }
    if (el.tagName === 'h4') { title = text($(el)); return; }
    const t = $(el), heading = title || section;
    title = '';
    if (NOT_ROOM_PRICES.test(heading)) return;
    const range = heading.replace(/：/g, ':').match(TIME_RANGE);
    if (!range) return skipped.push(`${heading}（時間帯なし）`);
    const [nameText, ...remarks] = heading.replace(/：/g, ':').replace(range[0], '').split('※').map(x => x.trim());
    let name = nameText.replace(/[【】（）()「」]/g, ' ').replace(/料金|税込|室料|お一人様|通常/g, '').replace(/\s+/g, ' ').trim();
    // The table's first row sometimes names the plan when headings don't ("昼30分 ドリンクバー無料").
    const firstRow = text(t.find('tr').first());
    const where = `${heading} ${section} ${firstRow}`;
    const plan = /ナイトパック/.test(where) ? 'night_pack' : /パック/.test(name) ? 'pack' : /フリータイム/.test(name) ? 'free_time'
      : /30分/.test(section + name + firstRow) ? '30min' : /フリータイム|パック/.test(section + firstRow) ? 'free_time' : null;
    if (!plan) return skipped.push(`${heading}（30分かフリータイムか不明）`);
    if (plan === '30min') name = '30分';
    else if (!name || /^(昼|夜|朝|深夜)$/.test(name)) name = `${name}${plan === 'pack' ? '3時間パック' : 'フリータイム'}`.trim();
    let period = name.match(/^(朝|昼|夜|深夜)/)?.[1] ?? null;
    if (period && plan === 'pack') name = name.slice(period.length);
    const slot = parseSlot(range[0], hours);
    if (!slot) return skipped.push(`${heading}（時間を特定できない）`); // e.g. OPEN with no readable opening hours
    period ??= t.parent().hasClass('night') ? '夜' : t.parent().hasClass('noon') ? '昼' : periodOf(slot);

    const rows = t.find('tr').toArray().map(tr => $(tr));
    const dayIdx = rows.findIndex(r => r.find('td, th').toArray().some(c => dayTokens(text($(c)).split('※')[0])));
    if (dayIdx < 0) return skipped.push(`${heading}（曜日の列なし）`);
    const days = rows[dayIdx].find('td, th').toArray().map(c => text($(c))).filter(l => dayTokens(l.split('※')[0])).map(label => {
      const [d, note] = label.split('※');
      const set = dayTokens(d);
      return isWeekdaySide(set)
        ? { day: 'weekday', label: d, note: note ? `${d}は${note}` : null }
        : { day: DOW.concat('hol', 'eve').filter(x => set.has(x)).join('+'), label: d, note: note ? `${d}は${note}` : null };
    });
    if (days.filter(d => d.day !== 'weekday').length > 1 || days.filter(d => d.day === 'weekday').length > 1) {
      return skipped.push(`${heading}（曜日の列が3つ以上）`);
    }
    const tableText = text(t);
    const oneDrink = /[1１]ドリンク/.test(tableText);
    const noteText = rows.map(r => text(r.find('td.charge_info_notes'))).join(' ');
    let lastEntry = null;
    const own = [];
    for (const n of [...remarks, ...noteText.split('※')].map(x => x.trim()).filter(Boolean)) {
      const le = n.match(/最終受付\s*(\d{1,2})(?:時|[:：](\d{2}))/);
      if (le) lastEntry = `${le[1].padStart(2, '0')}:${le[2] ?? '00'}`;
      else if (/ドリンクバー付|小学生|未就学|持ち込み|税込/.test(n)) notes.add(`※${n}`);
      else own.push(`※${n}`);
    }
    const drinkBar = c => /学生、?シニアはドリンクバー付/.test(tableText) && (c === 'student' || c === 'senior');

    for (const r of rows.slice(dayIdx + 1)) {
      const label = text(r.find('th'));
      const cells = r.find('td').toArray();
      if (!label || cells.length !== days.length) continue; // sub-headers, note rows
      const who = customerOf(label);
      cells.forEach((td, i) => {
        const raw = text($(td));
        const yen = parseInt(raw.replace(/[,，円]/g, ''), 10);
        const row = { ...who, period, name, plan, slot, day: days[i].day, yen: Number.isNaN(yen) ? null : yen, drinks_included: !oneDrink || drinkBar(who.customer) };
        if (days[i].day !== 'weekday') row.day_label = days[i].label;
        if (row.yen === null) row.text = raw || null; // keep the site's own words
        const slotNote = [days[i].note, ...own].filter(Boolean).join(' ');
        if (slotNote) row.slot_note = slotNote;
        if (lastEntry) row.last_entry = lastEntry;
        prices.push(row);
      });
    }
  });

  const info = label => $('dt').filter((_, e) => text($(e)) === label).first().next();
  return {
    prices,
    skipped,
    hours_text: hoursText(html),
    machines: info('取り扱い機種').find('img').toArray().map(i => normalizeMachine($(i).attr('alt') ?? '')).filter(isMachine),
    notes: [...notes],
  };
}

function hoursText(html) {
  const $ = cheerio.load(html);
  return text($('dt').filter((_, e) => text($(e)) === '営業時間').first().next()) || null;
}

// "月曜日 10:00～5:00 火曜日 …" → "10:00-5:00" (Monday, else the first range) for OPEN / CLOSE.
// (Text is NFKC-normalised, so "～" may arrive as "~".)
const mondayHours = h => (h?.match(/月曜日?\s*(\d{1,2}:\d{2})\s*[～~〜-]\s*翌?(\d{1,2}:\d{2})/) ??
  h?.match(/(\d{1,2}:\d{2})\s*[～~〜-]\s*翌?(\d{1,2}:\d{2})/))?.slice(1).join('-') ?? null;

export async function crawl({ offline = false } = {}) {
  // One request returns every shop inside a rectangle; this one covers Japan.
  const list = JSON.parse(await get('https://shop.big-echo.jp/api/point?b=24,122,46,154', 'bigecho-points.json', { offline })).items
    .filter(s => /ビッグエコー|BIG ECHO/i.test(s.name) && !/閉店/.test(s.name)); // names like "…店（2026/10/13閉店）" are closed
  // Last run's page addresses: one request per known shop instead of guess + store record + page.
  const DATA = new URL('../data/shops.json', import.meta.url);
  const known = new Map(existsSync(DATA) ? JSON.parse(readFileSync(DATA, 'utf8')).filter(x => x.brand === 'bigecho').map(x => [x.id, x.source_url]) : []);
  const shops = [], errors = [], warnings = [];
  for (const s of list) {
    // Usually the shop page's address is its name with spaces as hyphens. A wrong guess doesn't 404: the site
    // serves its home page, so "is this a shop page?" decides, and the shop's own record gives the real link.
    let url = known.get(`bigecho-${s.key}`) ?? `https://big-echo.jp/shop_info/${encodeURIComponent(s.name.trim().replace(/\s+/g, '-'))}`;
    try {
      let html = await get(url, `bigecho-${s.key}.html`, { offline }).catch(e => (/HTTP 404/.test(e.message) ? '' : Promise.reject(e)));
      if (!html.includes('shop-detail')) {
        const detail = JSON.parse(await get(`https://shop.big-echo.jp/api/point/${s.key}`, `bigecho-point-${s.key}.json`, { offline }));
        url = detail['短縮ＵＲＬ'];
        if (!url) throw new Error('no shop page link in the store record');
        html = await get(url, `bigecho-${s.key}-page.html`, { offline });
      }
      const base = {
        id: `bigecho-${s.key}`, brand: 'bigecho', name: s.name.replace(/^カラオケ\s*/, ''),
        address: s.address.replace(/\s+/g, ' ').trim(), lat: s.latitude, lng: s.longitude,
        tel: null, rooms: null, amenities: null, source_url: url, price_url: url, fetched_at: today(),
      };
      let page;
      try {
        page = parseShopPage(html, mondayHours(hoursText(html)));
        if (!page.prices.some(r => r.party === 'group' && r.plan === '30min' && r.customer === 'general')) throw new Error('no 30分 一般 price found');
      } catch (e) {
        // Can't read this page reliably: keep the shop as a pin with a link (missing beats wrong).
        warnings.push(`${url} (${s.name}): prices not read — ${e.message}`);
        shops.push({ ...base, hours: hoursText(html), machines: [], prices: [], notes: [], prices_as_of: null, price_error: e.message });
        continue;
      }
      if (page.skipped.length) warnings.push(`${url} (${s.name}): skipped ${page.skipped.join(' / ')}`);
      shops.push({ ...base, hours: page.hours_text, machines: page.machines, prices: page.prices, notes: page.notes,
        prices_as_of: today() }); // the page shows no price date: this is the day we read it
    } catch (e) { errors.push(`${url} (${s.name}): ${e.message}`); }
  }
  return { shops, errors, warnings };
}
