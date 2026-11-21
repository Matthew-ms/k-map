// Shared by all chain crawlers: polite cached fetching and small text helpers.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const UA = 'K-map/0.1 (+https://github.com/Matthew-ms/k-map)';
const CACHE = new URL('./cache/', import.meta.url);
const DELAY_MS = 3000;

export const PREFS = ',北海道,青森県,岩手県,宮城県,秋田県,山形県,福島県,茨城県,栃木県,群馬県,埼玉県,千葉県,東京都,神奈川県,新潟県,富山県,石川県,福井県,山梨県,長野県,岐阜県,静岡県,愛知県,三重県,滋賀県,京都府,大阪府,兵庫県,奈良県,和歌山県,鳥取県,島根県,岡山県,広島県,山口県,徳島県,香川県,愛媛県,高知県,福岡県,佐賀県,長崎県,熊本県,大分県,宮崎県,鹿児島県,沖縄県'.split(',');
export const text = el => el.text().replace(/\s+/g, ' ').trim();
export const stripMachine = name => name.replace(/（.*?）/g, '').trim();
export const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }); // YYYY-MM-DD, Japan date

// Period for a slot, from its start hour (used when the site doesn't name one).
export const periodOf = slot => { const h = +slot?.slice(0, 2); return h >= 5 && h < 10 ? '朝' : h >= 10 && h < 19 ? '昼' : h >= 19 && h < 22 ? '夜' : '深夜'; };

// "8時～10時" / "6:30～10時" / "OPEN〜18：00" / "18:00～翌5:00" → "HH:MM-HH:MM".
// 開店/OPEN and 閉店/CLOSE come from the shop's hours, e.g. "11:00-5:00".
export function parseSlot(s, hours) {
  const [open, close] = /^\d/.test(hours ?? '') ? hours.split('-') : [];
  s = s.replace(/：/g, ':').replace(/開店|OPEN/i, open ?? '?').replace(/閉店|CLOSE/i, close ?? '?');
  const t = [...s.matchAll(/(\d{1,2})(?:時|:(\d{2}))/g)].map(m => `${m[1].padStart(2, '0')}:${m[2] ?? '00'}`);
  return t.length === 2 ? `${t[0]}-${t[1]}` : null;
}

// Fetch with a raw cache so parser fixes can re-run without hitting the site (offline = cache only).
// The delay is per host, so different chains can be crawled at the same time without hurrying any one site.
const lastFetch = new Map(), refusedInRow = new Map();
export async function get(url, file, { offline, headers = {}, method = 'GET', body, binary = false } = {}) {
  const path = new URL(file, CACHE);
  if (offline === true || (offline === 'cached' && existsSync(path))) return readFileSync(path, binary ? undefined : 'utf8'); // 'cached': fetch only what's missing
  const host = new URL(url).host;
  for (;;) { // claim the next slot for this host before awaiting, so parallel callers queue up
    const wait = (lastFetch.get(host) ?? 0) + DELAY_MS - Date.now();
    if (wait <= 0) break;
    await new Promise(r => setTimeout(r, wait));
  }
  // A site refusing page after page is turning us away: stop asking (and don't sit out the job's time limit).
  if ((refusedInRow.get(host) ?? 0) >= 5) throw new Error(`${url}: not fetched, ${host} refused 5 pages in a row`);
  lastFetch.set(host, Date.now());
  let res;
  for (let attempt = 1; ; attempt++) { // up to two retries after a network blip, a refusal (403, 429) or a server error
    try { res = await fetch(url, { method, body, headers: { 'User-Agent': UA, ...headers } }); }
    catch (e) { if (attempt > 2) { refusedInRow.set(host, (refusedInRow.get(host) ?? 0) + 1); throw e; } res = null; }
    if (res?.ok || attempt > 2 || (res && ![403, 429].includes(res.status) && res.status < 500)) break;
    // Wait as long as the site asks (Retry-After in seconds, at most 5 min), else a minute; this host's queue waits too.
    const wait = Math.min(+res?.headers.get('retry-after') || 60, 300) * 1000;
    lastFetch.set(host, Date.now() + wait);
    await new Promise(r => setTimeout(r, wait));
  }
  refusedInRow.set(host, res.ok || res.status === 404 ? 0 : (refusedInRow.get(host) ?? 0) + 1);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = binary ? Buffer.from(await res.arrayBuffer()) : await res.text(); // binary: a Buffer (images)
  if (!existsSync(CACHE)) mkdirSync(CACHE);
  writeFileSync(path, text);
  return text;
}

// One spelling per machine across chains: "LIVEDAM Ai" → "LIVE DAM Ai", "JOYSOUND MAXGO" → "JOYSOUND MAX GO",
// "LIVE DAM WAO" → "LIVE DAM WAO!" (the product's own name; Manekineko drops the "!").
export const normalizeMachine = m => stripMachine(m)
  .replace(/^LIVE\s*DAM/i, 'LIVE DAM').replace(/MAX\s*GO/i, 'MAX GO').replace(/\bStadium\b/i, 'STADIUM').replace(/\bStage\b/i, 'STAGE')
  .replace(/\bWAO\b(?!!)/i, 'WAO!')
  .replace(/\s+/g, ' ').trim();
// Karaoke machines only (drops e.g. "E-bo", a song-search remote).
export const isMachine = m => /^(JOYSOUND|LIVE DAM|Premier DAM|CYBER DAM|DAM)\b/.test(m);

// A page the site refused or failed to serve, even after the retries, keeps the shop's record from the last good run
// (its fetched_at stays that day), so one refused page no longer blocks the whole week's update. It stays a problem
// when the record is over 28 days old, or when more than 10% of a chain's shop pages were refused. When the shop
// list itself was refused, the whole chain keeps last run's shops.
const REFUSED = /: HTTP (403|429|5\d\d)$|fetch failed$/;
export function keepLastGood(brand, r, prev, now = today()) {
  const was = prev.filter(s => s.brand === brand);
  const oldest = new Date(Date.parse(now) - 28 * 864e5).toISOString().slice(0, 10);
  const errors = [], warnings = [...(r.warnings ?? [])], kept = [];
  let pages = 0; // single shop pages refused
  for (const e of r.errors) {
    const whole = e.startsWith(`${brand}: `); // the chain's crawl failed before any shop (its shop list)
    const lost = whole ? (r.shops.length ? [] : was) : was.filter(s => e.startsWith(`${s.source_url} (`));
    if (!REFUSED.test(e) || !lost.length || lost.some(s => s.fetched_at < oldest)) { errors.push(e); continue; }
    if (!whole) pages++;
    kept.push(...lost);
    warnings.push(`${e} — kept ${whole ? `all ${lost.length} shops` : 'the record'} from the last good run (${lost[0].fetched_at})`);
  }
  if (pages > was.length * 0.1) return { ...r, errors: [...r.errors, `${brand}: ${pages} of ${was.length} shop pages refused`] };
  return { shops: [...r.shops, ...kept], errors, warnings, kept: kept.length };
}
