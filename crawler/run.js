// Usage: node crawler/run.js [--offline] [--areas=10,11] [--allow-drop]
//   --offline     re-parse crawler/cache/ without fetching (after a parser fix)
//   --areas       only these area ids (default: every area on jankara.ne.jp/shop/)
//   --allow-drop  write even if many shops disappeared since the last run
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { crawlArea, listAreas, knownMachines, UA } from './jankara.js';

const MAX_YEN = { '30min': 5000, free_time: 10000, pack: 10000, night_pack: 10000 };
const arg = name => process.argv.find(a => a.startsWith(`--${name}`));
const offline = !!arg('offline');
const OUT = new URL('../data/shops.json', import.meta.url);

// Japanese public holidays (this year, last year, next year) for 土日祝 / 祝前 price rows.
const HOLIDAYS = new URL('../data/holidays.json', import.meta.url);
if (!offline || !existsSync(HOLIDAYS)) {
  const res = await fetch('https://holidays-jp.github.io/api/v1/date.json', { headers: { 'User-Agent': UA } });
  const days = res.ok ? await res.json() : {};
  const year = new Date().getFullYear();
  if (!Object.keys(days).some(d => d.startsWith(year))) throw new Error(`holiday list has no ${year} dates (HTTP ${res.status})`);
  writeFileSync(HOLIDAYS, JSON.stringify(days, null, 1) + '\n');
}

const areas = arg('areas') ? arg('areas').split('=')[1].split(',').map(Number) : await listAreas({ offline });
const known = await knownMachines({ offline });
const byId = new Map(), errors = [];
for (const a of areas) {
  const r = await crawlArea(a, { offline });
  for (const s of r.shops) byId.set(s.id, s); // a shop listed in two areas is kept once
  errors.push(...r.errors);
  console.log(`area ${a}: ${r.shops.length} shops${r.errors.length ? `, ${r.errors.length} failed` : ''}`);
}
const shops = [...byId.values()];

// Wrong data is worse than missing data: refuse to write a file with problems.
const problems = [...errors, ...shops.flatMap(s => {
  const p = [];
  if (!s.name) p.push('no name');
  if (!(s.lat > 24 && s.lat < 46 && s.lng > 122 && s.lng < 154)) p.push(`coords outside Japan: ${s.lat},${s.lng}`);
  if (!s.prices_as_of) p.push('no price date');
  if (!s.prices.some(r => r.party === 'group' && r.plan === '30min' && r.customer === 'general')) p.push('no group 30min general price');
  for (const r of s.prices) {
    if (!r.slot) p.push(`unparsed slot in ${r.plan}`);
    if (r.yen === null && !r.text) p.push(`empty price cell (${r.party} ${r.plan} ${r.slot} ${r.day} ${r.customer})`);
    if (!r.period || !r.name) p.push(`unnamed slot ${r.plan} ${r.slot}`);
    // Floor ¥10, not the handover's ¥50: real morning prices go as low as ¥40 (e.g. 中洲川端駅前店).
    if (r.yen !== null && !(r.yen >= 10 && r.yen <= MAX_YEN[r.plan])) p.push(`odd price ¥${r.yen} (${r.party} ${r.plan} ${r.slot} ${r.day} ${r.customer})`);
  }
  for (const m of s.machines) if (!known.includes(m)) p.push(`unknown machine "${m}"`);
  return [...new Set(p)].map(msg => `${s.source_url} (${s.name}): ${msg}`);
})];
if (problems.length) {
  console.error(`\n${problems.length} problem(s), nothing written:\n${problems.join('\n')}`);
  process.exit(1);
}

// Compare with the last run so big changes get a human look before they go live.
if (existsSync(OUT)) {
  const prev = new Map(JSON.parse(readFileSync(OUT, 'utf8')).map(s => [s.id, s]));
  const added = shops.filter(s => !prev.has(s.id)), removed = [...prev.values()].filter(s => !byId.has(s.id));
  const key = r => `${r.party}|${r.period}|${r.name}|${r.slot}|${r.day}|${r.customer}`;
  const moves = shops.filter(s => prev.has(s.id)).flatMap(s => {
    const old = new Map(prev.get(s.id).prices.map(r => [key(r), r.yen]));
    return s.prices.filter(r => r.yen && old.get(key(r)) && Math.abs(r.yen - old.get(key(r))) / old.get(key(r)) > 0.2)
      .map(r => `  ${s.name} ${r.party} ${r.name} ${r.slot} ${r.day} ${r.customer}: ${old.get(key(r))} → ${r.yen}`);
  });
  console.log(`\nvs last run: +${added.length} shops, -${removed.length} shops, ${moves.length} price change(s) over 20%`);
  if (removed.length) console.log(removed.map(s => `  removed: ${s.name} ${s.source_url}`).join('\n'));
  if (moves.length) console.log(moves.slice(0, 30).join('\n') + (moves.length > 30 ? `\n  …and ${moves.length - 30} more` : ''));
  if (!arg('areas') && removed.length > prev.size * 0.1 && !arg('allow-drop')) {
    console.error(`\n${removed.length} of ${prev.size} shops disappeared (a site change?). Nothing written; re-run with --allow-drop if this is real.`);
    process.exit(1);
  }
}

// One shop per line: about a third smaller than indented JSON, and git diffs still show which shops changed.
writeFileSync(OUT, `[\n${shops.map(s => JSON.stringify(s)).join(',\n')}\n]\n`);
console.log(`\nWrote ${shops.length} shops, ${shops.reduce((n, s) => n + s.prices.length, 0)} price rows`);
