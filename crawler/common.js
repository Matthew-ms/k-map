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
const lastFetch = new Map();
export async function get(url, file, { offline, headers = {}, method = 'GET', body } = {}) {
  const path = new URL(file, CACHE);
  if (offline === true || (offline === 'cached' && existsSync(path))) return readFileSync(path, 'utf8'); // 'cached': fetch only what's missing
  const host = new URL(url).host;
  for (;;) { // claim the next slot for this host before awaiting, so parallel callers queue up
    const wait = (lastFetch.get(host) ?? 0) + DELAY_MS - Date.now();
    if (wait <= 0) break;
    await new Promise(r => setTimeout(r, wait));
  }
  lastFetch.set(host, Date.now());
  let res;
  for (let attempt = 1; ; attempt++) { // one retry after a network blip or a server error
    try { res = await fetch(url, { method, body, headers: { 'User-Agent': UA, ...headers } }); } catch (e) { if (attempt > 1) throw e; }
    if (res?.ok || attempt > 1) break;
    await new Promise(r => setTimeout(r, DELAY_MS * 3));
  }
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const text = await res.text();
  if (!existsSync(CACHE)) mkdirSync(CACHE);
  writeFileSync(path, text);
  return text;
}

// One spelling per machine across chains: "LIVEDAM Ai" → "LIVE DAM Ai", "JOYSOUND MAXGO" → "JOYSOUND MAX GO".
export const normalizeMachine = m => stripMachine(m)
  .replace(/^LIVE\s*DAM/i, 'LIVE DAM').replace(/MAX\s*GO/i, 'MAX GO').replace(/\bStadium\b/i, 'STADIUM').replace(/\bStage\b/i, 'STAGE')
  .replace(/\s+/g, ' ').trim();
// Karaoke machines only (drops e.g. "E-bo", a song-search remote).
export const isMachine = m => /^(JOYSOUND|LIVE DAM|Premier DAM|CYBER DAM|DAM)\b/.test(m);
