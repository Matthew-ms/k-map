// Usage: node crawler/run.js [--offline]   (--offline re-parses crawler/cache/ without fetching)
import { existsSync, writeFileSync } from 'node:fs';
import { crawlArea, UA } from './jankara.js';

const AREAS = [10]; // Namba/Shinsaibashi. Phase 4: read every area id from /shop/
const KNOWN_MACHINES = ['JOYSOUND X1', 'JOYSOUND MAX GO', 'JOYSOUND MAX2', 'JOYSOUND MAX', 'LIVE DAM WAO!', 'LIVE DAM AiR', 'LIVE DAM Ai'];
const MAX_YEN = { '30min': 5000, free_time: 10000, night_pack: 10000 };

const offline = process.argv.includes('--offline');

// Japanese public holidays (this year, last year, next year) for 土日祝 / 祝前 price rows.
const HOLIDAYS = new URL('../data/holidays.json', import.meta.url);
if (!offline || !existsSync(HOLIDAYS)) {
  const res = await fetch('https://holidays-jp.github.io/api/v1/date.json', { headers: { 'User-Agent': UA } });
  const days = res.ok ? await res.json() : {};
  const year = new Date().getFullYear();
  if (!Object.keys(days).some(d => d.startsWith(year))) throw new Error(`holiday list has no ${year} dates (HTTP ${res.status})`);
  writeFileSync(HOLIDAYS, JSON.stringify(days, null, 1) + '\n');
}

const shops = [];
for (const a of AREAS) shops.push(...await crawlArea(a, { offline }));

// Wrong data is worse than missing data: refuse to write a file with problems.
const problems = shops.flatMap(s => {
  const p = [];
  if (!s.name) p.push('no name');
  if (!(s.lat > 24 && s.lat < 46 && s.lng > 122 && s.lng < 154)) p.push(`coords outside Japan: ${s.lat},${s.lng}`);
  if (!s.prices_as_of) p.push('no price date');
  if (!s.prices.some(r => r.party === 'group' && r.plan === '30min' && r.customer === 'general')) p.push('no group 30min general price');
  for (const r of s.prices) {
    if (!r.slot) p.push(`unparsed slot in ${r.plan}`);
    if (r.yen === null && !r.text) p.push(`empty price cell (${r.party} ${r.plan} ${r.slot} ${r.day} ${r.customer})`);
    if (!r.period || !r.name) p.push(`unnamed slot ${r.plan} ${r.slot}`);
    if (r.yen !== null && !(r.yen >= 50 && r.yen <= MAX_YEN[r.plan])) p.push(`odd price ¥${r.yen} (${r.party} ${r.plan} ${r.slot} ${r.day} ${r.customer})`);
  }
  for (const m of s.machines) if (!KNOWN_MACHINES.includes(m)) p.push(`unknown machine "${m}"`);
  return [...new Set(p)].map(msg => `${s.id} ${s.name}: ${msg}`);
});
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

writeFileSync(new URL('../data/shops.json', import.meta.url), JSON.stringify(shops, null, 1) + '\n');
console.log(`Wrote ${shops.length} shops, ${shops.reduce((n, s) => n + s.prices.length, 0)} price rows`);
