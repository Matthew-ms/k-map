// Price logic shared by the app and the tests. No DOM here.
// Day types and the rules for 平日 are explained in README → "Day types".

export const PERIODS = ['朝', '昼', '夜', '深夜'];
export const PLAN_ORDER = ['30min', 'free_time', 'pack', 'night_pack'];
// Plan names: the chains' headings carry times, days, last entry and slogans ("期間限定 おはカラフリータイム 最終受付12:00").
// The table shows those elsewhere, so the display name keeps only what makes the plan special (おはカラ, ロング, 学生限定…).
const T = String.raw`(?:翌)?(?:\d{1,2}(?:[:：]\d{2}|時(?!間))|OPEN|CLOSE|LAST)`;
const D = String.raw`(?:[月火水木金土日](?:曜日?)?|祝(?:前日?|祭?日)?|平日|週末|休日)`;
const DECOR = /[★☆●≪≫♪!！<>＜＞【】]|お得[なの]?|本気の|期間限定|必見|カラオケ|ドリンクバー付き?|DB付|1ドリンク制|時間保証|持ち込みOK|様/g;
const LAST = new RegExp(String.raw`最終受付\s*[:：]?\s*${T}?|${T}?\s*(?:受付終了|受付限定|まで受付|までのご入室|まで滞在可能|まで|迄|受付)`, 'g');
const TIMES = new RegExp(String.raw`${T}(?:\s*[~〜～\-]\s*${T}?)?|[~〜～\-]\s*${T}`, 'gi');
const DAYS = new RegExp(String.raw`${D}(?:[・、,/&\s]*[~〜～]?[・、,/&\s]*${D})*(?:は|のみ|限定|以外)?`, 'g');
const tidy = s => s.replace(/内\d+時間/g, ' ').replace(/(^|\s)[\d:・、/,&]+(?=\s|$)/g, ' ')
  .replace(/^[\s:：/・、,&の]+|[\s:：/・、,&は]+$/g, '').replace(/\s*[:：/]\s*/g, ' ').replace(/\s+/g, ' ').trim();
export function shortName(name, plan) {
  const s = tidy(name.replace(/お昼/g, '昼').replace(DECOR, '').replace(LAST, ' ').replace(TIMES, ' ').replace(DAYS, ' '));
  if (s.length < 2 || s.length > 16) return null; // nothing left, or still a sentence: the caller falls back
  return plan === 'pack' && s === 'パック' && /\d+時間/.test(name) ? `${name.match(/\d+時間/)[0]}パック` : s;
}
// Last entry written into a heading ("3時間パック 最終受付16:00"): the crawler reads it into last_entry.
export const LAST_IN_NAME = new RegExp(String.raw`最終受付\s*[:：]?\s*${T}|${T}\s*受付終了`, 'g');
// The site's own heading, when the short name dropped more than decoration, the last entry and the slot's own times
// (days, other time windows, conditions like "アムザ1000飲食店ご利用後"). Shown under the table so nothing is lost.
export function nameNote(e) {
  if (e.plan === '30min') return null;
  const own = e.slot.split('-').flatMap(t => [t, t.replace(/^0/, '')]);
  let rest = e.name.replace(/お昼/g, '昼').replace(DECOR, '').replace(LAST_IN_NAME, ' ');
  for (const t of own) rest = rest.split(t).join(' ');
  rest = tidy(rest.replace(/翌|受付/g, ' ').replace(/[~〜～\-]\s*(?=\s|$)/g, ' ').replace(/(OPEN|CLOSE|LAST)/gi, ' '));
  const short = shortName(e.name, e.plan);
  return short && rest.replace(/\s/g, '') === short.replace(/\s/g, '') ? null : e.name;
}
// Display name for a slot: "昼 30分", "昼3時間パック", "おはカラフリータイム", or "夜フリータイム" when the heading has no usable name.
export function slotName(e) {
  if (e.plan === '30min') return e.name === '30分' ? `${e.period} 30分` : shortName(e.name, e.plan) ?? `${e.period} 30分`;
  const s = shortName(e.name, e.plan);
  if (e.plan === 'pack') return /^\d|^パック$/.test(s ?? '') ? `${e.period}${s}` : s ?? `${e.period}パック`;
  return s ?? `${e.period}${e.plan === 'night_pack' ? 'ナイトパック' : 'フリータイム'}`;
}
const DAY_MS = 864e5;

const startHour = slot => { const h = +slot.slice(0, 2); return h < 5 ? h + 24 : h; }; // after-midnight starts sort last
// Site order: by period, then 30分 → フリータイム → ナイトパック, then start time
export const bySiteOrder = (a, b) =>
  PERIODS.indexOf(a.period) - PERIODS.indexOf(b.period) || PLAN_ORDER.indexOf(a.plan) - PLAN_ORDER.indexOf(b.plan) || startHour(a.slot) - startHour(b.slot);

// Rows for one party. A 1名 table only lists slots with a solo surcharge, so the other slots take the
// 2名以上 price, marked `fallback` so the UI can say so.
export function rowsFor(shop, party) {
  const key = p => `${p.period}|${p.name}|${p.slot}|${p.day}|${p.customer}`;
  const own = shop.prices.filter(p => p.party === party);
  if (party !== 'solo') return own;
  const have = new Set(own.map(key));
  return [...own, ...shop.prices.filter(p => p.party === 'group' && !have.has(key(p))).map(p => ({ ...p, fallback: true }))];
}

// One entry per slot, in site order: { period, name, plan, slot, otherDay, weekday: {customer: row}, other: {customer: row} }.
// A slot with more special-day columns (月～木 / 金・祝前 / 土日祝) keeps the next ones as other2, other3…; `otherCols`
// lists them all as { key, day, label }. `weekdayDays`: the 平日 column's own days when it doesn't cover the rest
// (a lone 月～金 column), else null.
export function slotTable(shop, party) {
  const slots = new Map();
  for (const p of rowsFor(shop, party)) {
    const k = `${p.period}|${p.name}|${p.slot}`;
    if (!slots.has(k)) slots.set(k, { period: p.period, name: p.name, plan: p.plan, slot: p.slot, otherDay: null, otherDayLabel: null, weekday: {}, other: {}, otherCols: [], weekdayDays: null });
    const s = slots.get(k);
    if (p.day === 'weekday') { s.weekday[p.customer] = p; s.weekdayDays ??= p.weekday_days ?? null; continue; }
    let col = s.otherCols.find(c => c.day === p.day);
    if (!col) {
      col = { key: s.otherCols.length ? `other${s.otherCols.length + 1}` : 'other', day: p.day, label: p.day_label ?? null };
      s.otherCols.push(col);
      s[col.key] ??= {};
      if (col.key === 'other') { s.otherDay = p.day; s.otherDayLabel = col.label; }
    }
    s[col.key][p.customer] = p;
  }
  return [...slots.values()].sort(bySiteOrder);
}

// A chain without your customer type gets the closest one, marked `substitute` so the UI can say so.
// In order of preference: only Jankara has 学生会員, so the student price (Big Echo 学割) comes first, then 会員
// (Manekineko has only 会員 / 一般). A non-member student falls back to 一般.
export const CUSTOMER_SUBS = { student_member: ['student', 'member'], student: ['general'] };
export function forCustomer(byCustomer, customer) {
  if (byCustomer?.[customer]) return byCustomer[customer];
  const sub = (CUSTOMER_SUBS[customer] ?? []).find(c => byCustomer?.[c]);
  return sub ? { ...byCustomer[sub], substitute: sub } : undefined;
}

// Japan date parts for a moment (Japan has no daylight saving, so +9h is exact).
export function jst(date) {
  const t = new Date(date.getTime() + 9 * 3600e3);
  return { ymd: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}
const shiftDay = (ymd, n) => new Date(Date.parse(ymd) + n * DAY_MS).toISOString().slice(0, 10);
const dow = ymd => new Date(ymd).getUTCDay(); // 0 = Sunday

// A day type is a set of days: weekdays sun…sat, "hol" (public holiday) and "eve" (the day before one).
// Named types are Jankara's labels; other chains store the set itself, e.g. "fri+sat+eve" (金・土・祝前日).
const NAMED_DAYS = {
  weekend_holiday: 'sat+sun+hol', // 土日祝
  sun_holiday: 'sun+hol', // 日祝
  fri_sun_hol_eve: 'fri+sat+sun+hol+eve', // 金土日祝祝前
  fri_sat_hol_eve: 'fri+sat+eve', // 金土祝前
};
export const DOW = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
// The day set behind a day type, e.g. 'weekend_holiday' → ['sat', 'sun', 'hol'] (used to write day labels in any language).
export const daySet = type => (NAMED_DAYS[type] ?? type).split('+');

// Does calendar day `ymd` fall under a non-weekday day type? `holidays` = { "2026-11-03": "文化の日", … }
export function isDayType(type, ymd, holidays) {
  const set = (NAMED_DAYS[type] ?? type).split('+');
  if (!set.every(t => DOW.includes(t) || t === 'hol' || t === 'eve')) throw new Error(`unknown day type ${type}`);
  return set.includes(DOW[dow(ymd)]) || (set.includes('hol') && ymd in holidays) || (set.includes('eve') && shiftDay(ymd, 1) in holidays);
}

const toMin = hhmm => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3);
// If `slot` ("19:00-08:00") is running at minute-of-day `min`, the day it started: 0 = today, -1 = yesterday. Else null.
export function slotStart(slot, min) {
  const [a, b] = slot.split('-').map(toMin);
  if (a < b) return min >= a && min < b ? 0 : null;
  return min >= a ? 0 : min < b ? -1 : null; // crosses midnight
}

// Which column of a slot applies at `now`: 'weekday', 'other' (or 'other2'…), or null (slot not running, or no column
// covers that day). The day type belongs to the day the slot started: at 02:00 Saturday a 19:00–8:00 slot uses Friday.
export function whichDay(entry, now, holidays) {
  const t = jst(now);
  const off = slotStart(entry.slot, t.min);
  if (off === null) return null;
  const day = shiftDay(t.ymd, off);
  const cols = entry.otherCols ?? (entry.otherDay ? [{ key: 'other', day: entry.otherDay }] : []);
  const col = cols.find(c => isDayType(c.day, day, holidays));
  if (col) return col.key;
  if (entry.weekdayDays && !isDayType(entry.weekdayDays, day, holidays)) return null; // e.g. a 月～金-only slot on Saturday
  // A Saturday the special column leaves out while the slot's other column is 平日 (e.g. 日祝 tables): no price
  // (shop note: 土曜日の夕方フリータイムは実施しておりません).
  if (entry.otherDay === 'sun_holiday' && dow(day) === 6) return null;
  return 'weekday';
}

// The price row for this plan running at `now`, or null. { entry, day: 'weekday'|'other'|'other2'…, row }
// ponytail: ignores 最終受付 (last entry) — fine for 30分, not for "can I still start free time now".
export function currentPrice(shop, { plan = '30min', party, customer, now = new Date(), holidays }) {
  for (const entry of slotTable(shop, party)) {
    if (entry.plan !== plan) continue;
    const day = whichDay(entry, now, holidays);
    const row = day && forCustomer(entry[day], customer);
    if (row) return { entry, day, row };
  }
  return null;
}

// ---- Visit estimate (per person) ----
const HALF_MS = 30 * 60e3;
const hhmm = min => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const into = (slot, t) => (toMin(t) - toMin(slot.slice(0, 5)) + 1440) % 1440; // minutes since the slot began
const slotLength = slot => into(slot, slot.slice(6)) || 1440;

// 最終受付 (last entry) of a running slot's row at `start`, using the 土日祝 / 金土祝前 variant when it applies.
// → { last: "15:00" | null, late: past it }
export function lastEntry(entry, row, start, holidays) {
  const t = jst(start);
  const startDay = shiftDay(t.ymd, slotStart(entry.slot, t.min) ?? 0);
  const alt = row.last_entry_alt && isDayType(row.last_entry_alt.day, startDay, holidays) ? row.last_entry_alt.time : null;
  const last = alt ?? row.last_entry ?? null;
  return { last, late: last != null && into(entry.slot, hhmm(t.min)) > into(entry.slot, last) };
}

// Free-time / night-pack options that can be started at `start`, usable ones first, cheapest first.
export function freeOptions(shop, { party, customer, start, holidays }) {
  const out = [];
  for (const entry of slotTable(shop, party)) {
    if (entry.plan === '30min') continue;
    const day = whichDay(entry, start, holidays);
    const row = day && forCustomer(entry[day], customer);
    if (!row) continue;
    out.push({ key: `${entry.period}|${entry.name}|${entry.slot}`, entry, day, row, ...lastEntry(entry, row, start, holidays) });
  }
  return out.sort((a, b) => a.late - b.late || (a.row.yen ?? Infinity) - (b.row.yen ?? Infinity));
}

// mode 'time': `blocks` × 30分, each block priced by the 30分 slot running when it starts.
//   → { segs: [{ from, to, count, cp, yen }], perPerson (null if any block has no price), missing, cheaperFree }
// mode 'free': → { options, pick, perPerson }
// ponytail: a block that straddles a slot boundary takes the starting slot's price; the shop may round differently.
export function estimate(shop, { party, customer, start, mode, blocks = 2, freeKey, holidays }) {
  const options = freeOptions(shop, { party, customer, start, holidays });
  if (mode === 'free') {
    // The saved choice wins only while it can still be started; otherwise the cheapest one that can.
    const pick = options.find(o => o.key === freeKey && !o.late) ?? options.find(o => !o.late && o.row.yen != null) ?? null;
    return { mode, options, pick, perPerson: pick?.row.yen ?? null };
  }
  const segs = [];
  let sum = 0, missing = 0;
  for (let i = 0; i < blocks; i++) {
    const from = new Date(start.getTime() + i * HALF_MS);
    const cp = currentPrice(shop, { plan: '30min', party, customer, now: from, holidays });
    const yen = cp?.row.yen ?? null;
    yen == null ? missing++ : (sum += yen);
    const key = cp ? `${cp.entry.period}|${cp.entry.slot}|${cp.day}|${yen}` : 'none';
    const last = segs.at(-1);
    if (last?.key === key) { last.count++; last.to = new Date(from.getTime() + HALF_MS); }
    else segs.push({ key, from, to: new Date(from.getTime() + HALF_MS), count: 1, cp, yen });
  }
  // A free-time option that covers the whole stay and costs less is worth pointing out.
  const packMinutes = e => (e.plan === 'pack' ? (+e.name.match(/(\d+)時間/)?.[1] || 0) * 60 : Infinity); // 3時間パック covers 3 hours
  const fits = o => !o.late && o.row.yen != null && blocks * 30 <= packMinutes(o.entry) &&
    into(o.entry.slot, hhmm(jst(start).min)) + blocks * 30 <= slotLength(o.entry.slot);
  const cheaperFree = !missing ? options.find(o => fits(o) && o.row.yen < sum) ?? null : null;
  return { mode, segs, perPerson: missing ? null : sum, partial: sum, missing, cheaperFree };
}

// ---- Comparison "right now" ----
// For each shop, what you could pay at `now`: mode '30min' → the 30分 slots running now; mode 'free' → free time,
// packs and night packs you could still start now (before 最終受付). Cheapest first per shop, shops by their cheapest.
// → { ranked: [{ shop, main, others }], none: [{ shop, reason: 'no_prices' | 'none_now' }] }
export function rankNow(shops, { mode, party, customer, now = new Date(), holidays }) {
  const ranked = [], none = [];
  for (const shop of shops) {
    if (!shop.prices.length) { none.push({ shop, reason: 'no_prices' }); continue; }
    let options;
    if (mode === '30min') {
      options = slotTable(shop, party).filter(e => e.plan === '30min').map(entry => {
        const day = whichDay(entry, now, holidays);
        const row = day && forCustomer(entry[day], customer);
        return row && { entry, day, row };
      }).filter(Boolean);
    } else {
      options = freeOptions(shop, { party, customer, start: now, holidays }).filter(o => !o.late);
    }
    options = options.filter(o => o.row.yen != null).sort((a, b) => a.row.yen - b.row.yen);
    if (options.length) ranked.push({ shop, main: options[0], others: options.slice(1) });
    else none.push({ shop, reason: 'none_now' });
  }
  ranked.sort((a, b) => a.main.row.yen - b.main.row.yen);
  return { ranked, none };
}
