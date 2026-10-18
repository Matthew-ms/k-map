// Usage: node crawler/run.js [--offline] [--brands=jankara,bigecho] [--areas=10,11] [--allow-drop]
//   --offline     re-parse crawler/cache/ without fetching (after a parser fix)
//   --brands      only these chains; the others keep their shops from the last run
//   --areas       Jankara only: these area ids (writes only those Jankara shops!)
//   --allow-drop  write even if many shops of a chain disappeared since the last run
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { UA, isMachine } from './common.js';
import * as jankara from './jankara.js';
import * as bigecho from './bigecho.js';
import * as manekineko from './manekineko.js';
import * as karaokekan from './karaokekan.js';
import { applyManual } from './manual.js';

const CHAINS = { jankara, bigecho, manekineko, karaokekan };
const WITH_PRICES = new Set(['jankara', 'bigecho']); // the others are map pins with a link to their official prices
const MAX_YEN = { '30min': 5000, free_time: 10000, pack: 10000, night_pack: 10000 };
const arg = name => process.argv.find(a => a.startsWith(`--${name}`));
const list = name => arg(name)?.split('=')[1].split(',');
const offline = arg('offline') ? true : arg('cached') ? 'cached' : false; // --cached: reuse saved pages, fetch only missing ones
const OUT = new URL('../data/shops.json', import.meta.url);
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];

// Japanese public holidays (this year, last year, next year) for 土日祝 / 祝前 price rows.
const HOLIDAYS = new URL('../data/holidays.json', import.meta.url);
if (!offline || !existsSync(HOLIDAYS)) {
  const res = await fetch('https://holidays-jp.github.io/api/v1/date.json', { headers: { 'User-Agent': UA } });
  const days = res.ok ? await res.json() : {};
  const year = new Date().getFullYear();
  if (!Object.keys(days).some(d => d.startsWith(year))) throw new Error(`holiday list has no ${year} dates (HTTP ${res.status})`);
  writeFileSync(HOLIDAYS, JSON.stringify(days, null, 1) + '\n');
}

// Chains run side by side; each site still gets one request per 3 seconds.
const brands = list('brands') ?? Object.keys(CHAINS);
const results = await Promise.all(brands.map(async b => {
  try { return [b, await CHAINS[b].crawl({ offline, areas: b === 'jankara' ? list('areas')?.map(Number) : undefined })]; }
  catch (e) { return [b, { shops: [], errors: [`${b}: ${e.message}`] }]; }
}));
const byId = new Map(), errors = [], warnings = [];
for (const [b, r] of results) {
  for (const s of r.shops) byId.set(s.id, s); // a shop listed twice is kept once
  errors.push(...r.errors);
  warnings.push(...(r.warnings ?? []));
  const priced = r.shops.filter(s => s.prices.length).length;
  console.log(`${b}: ${r.shops.length} shops${WITH_PRICES.has(b) ? ` (${priced} with prices)` : ''}${r.errors.length ? `, ${r.errors.length} failed` : ''}`);
}
const shops = [...byId.values()];
// --offline re-parses saved pages: nothing was fetched today, so keep the dates from when the page was really fetched.
if (offline === true) for (const s of shops) {
  const p = prev.find(x => x.id === s.id);
  if (p) Object.assign(s, { fetched_at: p.fetched_at, prices_as_of: p.prices_as_of ?? s.prices_as_of });
}
// Chains not crawled this time keep their shops from the last run.
const kept = prev.filter(s => !brands.includes(s.brand));
const all = [...kept, ...shops];
// Hand-entered prices (data/manual-prices.json) go onto their shops every run, then get the same checks.
warnings.push(...applyManual(all));

// Warnings don't block: a shop whose prices can't be read stays a pin with a link (missing beats wrong).
if (warnings.length) console.log(`\n${warnings.length} warning(s):\n${warnings.join('\n')}`);

// Wrong data is worse than missing data: refuse to write a file with problems.
const problems = [...errors, ...[...shops, ...kept.filter(s => s.manual)].flatMap(s => {
  const p = [];
  if (!s.name) p.push('no name');
  if (!(s.lat > 24 && s.lat < 46 && s.lng > 122 && s.lng < 154)) p.push(`coords outside Japan: ${s.lat},${s.lng}`);
  for (const m of s.machines) if (!isMachine(m)) p.push(`not a karaoke machine name: "${m}"`);
  if ((!WITH_PRICES.has(s.brand) && !s.manual) || s.price_error) {
    if (!s.price_url) p.push('no link to official prices');
  } else {
    if (!s.prices_as_of) p.push('no price date');
    if (!s.prices.some(r => r.party === 'group' && r.plan === '30min' && r.customer === 'general')) p.push('no group 30min general price');
    for (const r of s.prices) {
      if (!r.slot) p.push(`unparsed slot in ${r.plan} ${r.name}`);
      if (r.yen === null && !r.text) p.push(`empty price cell (${r.party} ${r.plan} ${r.slot} ${r.day} ${r.customer})`);
      if (!r.period || !r.name) p.push(`unnamed slot ${r.plan} ${r.slot}`);
      // Floor ¥10, not the handover's ¥50: real morning prices go as low as ¥40 (e.g. Jankara 中洲川端駅前店).
      // ¥0 is allowed: some shops really list "0円" (e.g. Big Echo 恵比寿南店, students' weekday free time).
      if (r.yen !== null && r.yen !== 0 && !(r.yen >= 10 && r.yen <= MAX_YEN[r.plan])) p.push(`odd price ¥${r.yen} (${r.party} ${r.plan} ${r.slot} ${r.day} ${r.customer})`);
    }
  }
  return [...new Set(p)].map(msg => `${s.source_url} (${s.name}): ${msg}`);
})];
if (problems.length) {
  console.error(`\n${problems.length} problem(s), nothing written:\n${problems.join('\n')}`);
  process.exit(1);
}

// Compare with the last run so big changes get a human look before they go live.
const before = new Map(prev.map(s => [s.id, s]));
const key = r => `${r.party}|${r.period}|${r.name}|${r.slot}|${r.day}|${r.customer}`;
for (const b of brands) {
  const was = prev.filter(s => s.brand === b), now = shops.filter(s => s.brand === b);
  const removed = was.filter(s => !byId.has(s.id));
  const moves = now.filter(s => before.has(s.id)).flatMap(s => {
    const old = new Map(before.get(s.id).prices.map(r => [key(r), r.yen]));
    return s.prices.filter(r => r.yen && old.get(key(r)) && Math.abs(r.yen - old.get(key(r))) / old.get(key(r)) > 0.2)
      .map(r => `  ${s.name} ${r.party} ${r.name} ${r.slot} ${r.day} ${r.customer}: ${old.get(key(r))} → ${r.yen}`);
  });
  console.log(`\n${b} vs last run: +${now.filter(s => !before.has(s.id)).length} shops, -${removed.length} shops, ${moves.length} price change(s) over 20%`);
  if (removed.length) console.log(removed.slice(0, 20).map(s => `  removed: ${s.name} ${s.source_url}`).join('\n'));
  if (moves.length) console.log(moves.slice(0, 30).join('\n') + (moves.length > 30 ? `\n  …and ${moves.length - 30} more` : ''));
  // A site redesign can also show up as shops quietly losing their prices.
  const pricedWas = was.filter(s => s.prices.length).length, pricedNow = now.filter(s => s.prices.length).length;
  if (WITH_PRICES.has(b) && pricedWas && pricedNow < pricedWas * 0.9 && !arg('allow-drop')) {
    console.error(`
${b}: shops with prices fell from ${pricedWas} to ${pricedNow}. Nothing written; re-run with --allow-drop if this is real.`);
    process.exit(1);
  }
  if (!arg('areas') && removed.length > was.length * 0.1 && !arg('allow-drop')) {
    console.error(`\n${b}: ${removed.length} of ${was.length} shops disappeared (a site change?). Nothing written; re-run with --allow-drop if this is real.`);
    process.exit(1);
  }
}

// One shop per line: smaller than indented JSON, and git diffs still show which shops changed.
writeFileSync(OUT, `[\n${all.map(s => JSON.stringify(s)).join(',\n')}\n]\n`);
console.log(`\nWrote ${all.length} shops (${brands.join(', ')} refreshed), ${all.reduce((n, s) => n + s.prices.length, 0)} price rows`);
