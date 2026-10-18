// Prices typed in by hand from a chain's official price sheet (data/manual-prices.json), for chains whose prices
// the crawler can't read (Manekineko: PDFs in a folder robots.txt closes to crawlers). Merged on every run.
import { existsSync, readFileSync } from 'node:fs';

const FILE = new URL('../data/manual-prices.json', import.meta.url);
const STALE_DAYS = 90;
const CUSTOMERS = ['student_member', 'student', 'member', 'senior', 'general'];

// One slot { slot, days, member: [weekday, other], … } → price rows like the crawlers produce.
export function expandManual(entry) {
  const rows = [];
  for (const s of entry.slots) {
    const [other, label] = entry.days[s.days] ?? [];
    if (!other) throw new Error(`slot ${s.name} ${s.slot}: unknown days "${s.days}"`);
    for (const customer of CUSTOMERS) {
      (s[customer] ?? []).forEach((yen, i) => {
        if (yen == null) return;
        const row = { party: 'group', period: s.period, name: s.name, plan: s.plan, slot: s.slot, day: i ? other : 'weekday',
          customer, yen, drinks_included: entry.drinks_included };
        if (i) row.day_label = label;
        if (s.last) row.last_entry = s.last;
        if (s.note) row.slot_note = s.note;
        rows.push(row);
      });
    }
  }
  return rows;
}

// Puts hand-entered prices onto their shops. Returns warnings (unknown shop ids, entries due for a re-check).
export function applyManual(shops) {
  if (!existsSync(FILE)) return [];
  const manual = JSON.parse(readFileSync(FILE, 'utf8'));
  const byId = new Map(shops.map(s => [s.id, s]));
  const warnings = [];
  for (const [id, entry] of Object.entries(manual)) {
    if (id.startsWith('_')) continue;
    const shop = byId.get(id);
    if (!shop) { warnings.push(`manual prices for unknown shop ${id}`); continue; }
    Object.assign(shop, {
      prices: expandManual(entry),
      notes: entry.notes ?? [],
      prices_as_of: entry.checked_on,
      price_url: entry.source ?? shop.price_url,
      manual: { checked_on: entry.checked_on, source: entry.source },
    });
    const age = (Date.now() - Date.parse(entry.checked_on)) / 864e5;
    if (age > STALE_DAYS) warnings.push(`${shop.name} (${id}): hand-entered prices are ${Math.floor(age)} days old — re-check ${entry.source}`);
  }
  return warnings;
}
