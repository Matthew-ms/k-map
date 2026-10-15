// Price logic shared by the app and the tests. No DOM here.
// Day types and the rules for 平日 are explained in README → "Day types".

export const PERIODS = ['朝', '昼', '夜', '深夜'];
export const PLAN_ORDER = ['30min', 'free_time', 'night_pack'];
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

// One entry per slot, in site order: { period, name, plan, slot, otherDay, weekday: {customer: row}, other: {customer: row} }
export function slotTable(shop, party) {
  const slots = new Map();
  for (const p of rowsFor(shop, party)) {
    const k = `${p.period}|${p.name}|${p.slot}`;
    if (!slots.has(k)) slots.set(k, { period: p.period, name: p.name, plan: p.plan, slot: p.slot, otherDay: null, weekday: {}, other: {} });
    const s = slots.get(k);
    if (p.day === 'weekday') s.weekday[p.customer] = p;
    else { s.other[p.customer] = p; s.otherDay = p.day; }
  }
  return [...slots.values()].sort(bySiteOrder);
}

// Japan date parts for a moment (Japan has no daylight saving, so +9h is exact).
export function jst(date) {
  const t = new Date(date.getTime() + 9 * 3600e3);
  return { ymd: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}
const shiftDay = (ymd, n) => new Date(Date.parse(ymd) + n * DAY_MS).toISOString().slice(0, 10);
const dow = ymd => new Date(ymd).getUTCDay(); // 0 = Sunday

// Does calendar day `ymd` fall under a non-weekday day type? `holidays` = { "2026-11-03": "文化の日", … }
export function isDayType(type, ymd, holidays) {
  const d = dow(ymd), hol = ymd in holidays, eve = shiftDay(ymd, 1) in holidays;
  switch (type) {
    case 'weekend_holiday': return d === 0 || d === 6 || hol; // 土日祝
    case 'sun_holiday': return d === 0 || hol; // 日祝
    case 'fri_sun_hol_eve': return d === 5 || d === 6 || d === 0 || hol || eve; // 金土日祝祝前
    case 'fri_sat_hol_eve': return d === 5 || d === 6 || eve; // 金土祝前
  }
  throw new Error(`unknown day type ${type}`);
}

const toMin = hhmm => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3);
// If `slot` ("19:00-08:00") is running at minute-of-day `min`, the day it started: 0 = today, -1 = yesterday. Else null.
export function slotStart(slot, min) {
  const [a, b] = slot.split('-').map(toMin);
  if (a < b) return min >= a && min < b ? 0 : null;
  return min >= a ? 0 : min < b ? -1 : null; // crosses midnight
}

// Which row of a slot applies at `now`: 'weekday', 'other', or null (slot not running, or no row covers that day).
// The day type belongs to the day the slot started: at 02:00 Saturday a 19:00–8:00 slot uses Friday.
export function whichDay(entry, now, holidays) {
  const t = jst(now);
  const off = slotStart(entry.slot, t.min);
  if (off === null) return null;
  const day = shiftDay(t.ymd, off);
  if (entry.otherDay && isDayType(entry.otherDay, day, holidays)) return 'other';
  if (entry.otherDay === 'sun_holiday' && dow(day) === 6) return null; // Saturday is in neither row (shop note: 土曜日は実施しておりません)
  return 'weekday';
}

// The price row for this plan running at `now`, or null. { entry, day: 'weekday'|'other', row }
// ponytail: ignores 最終受付 (last entry) — fine for 30分, not for "can I still start free time now".
export function currentPrice(shop, { plan = '30min', party, customer, now = new Date(), holidays }) {
  for (const entry of slotTable(shop, party)) {
    if (entry.plan !== plan) continue;
    const day = whichDay(entry, now, holidays);
    const row = day && entry[day][customer];
    if (row) return { entry, day, row };
  }
  return null;
}
