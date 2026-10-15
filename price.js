// Price logic shared by the app and the tests. No DOM here.
// Day types and the rules for 平日 are explained in README → "Day types".

export const PERIODS = ['朝', '昼', '夜', '深夜'];
export const PLAN_ORDER = ['30min', 'free_time', 'pack', 'night_pack'];
// Display name for a slot: "昼 30分", "昼3時間パック", or the site's own name ("夕方フリータイム").
export const slotName = e => (e.plan === '30min' ? `${e.period} 30分` : e.plan === 'pack' ? `${e.period}${e.name}` : e.name);
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

// ---- Visit estimate (per person) ----
const HALF_MS = 30 * 60e3;
const hhmm = min => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const into = (slot, t) => (toMin(t) - toMin(slot.slice(0, 5)) + 1440) % 1440; // minutes since the slot began
const slotLength = slot => into(slot, slot.slice(6)) || 1440;

// Free-time / night-pack options that can be started at `start`, usable ones first, cheapest first.
// `late` = past 最終受付 (last entry), using the 土日祝 / 金土祝前 variant when it applies.
export function freeOptions(shop, { party, customer, start, holidays }) {
  const t = jst(start), now = hhmm(t.min);
  const out = [];
  for (const entry of slotTable(shop, party)) {
    if (entry.plan === '30min') continue;
    const day = whichDay(entry, start, holidays);
    const row = day && entry[day][customer];
    if (!row) continue;
    const startDay = shiftDay(t.ymd, slotStart(entry.slot, t.min));
    const alt = row.last_entry_alt && isDayType(row.last_entry_alt.day, startDay, holidays) ? row.last_entry_alt.time : null;
    const last = alt ?? row.last_entry ?? null;
    out.push({ key: `${entry.period}|${entry.name}|${entry.slot}`, entry, day, row, last, late: last != null && into(entry.slot, now) > into(entry.slot, last) });
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
