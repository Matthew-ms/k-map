// Manekineko's price PDFs sit in a folder robots.txt closes to scripts, so a person clicks each link. This does the rest:
//   node scripts/manekineko-pdfs.js                    # Osaka and Tokyo
//   node scripts/manekineko-pdfs.js --pref=神奈川県,埼玉県
// It moves the PDFs clicked so far from Downloads into manual/ as <shop>.pdf, then writes the list of what is still
// to click, manual/manekineko-download-list.html. It never fetches a PDF. Shops whose hand-entered sheet was replaced
// (the crawl saw a new link) are listed too, whatever the prefecture. Other options: --from (default ~/Downloads).
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAX_AGE_DAYS = 30; // names like "最終.pdf" are generic: an old file in Downloads is not this round's price sheet

const slug = s => s.id.replace(/^manekineko-/, '');
const day = ms => new Date(ms).toISOString().slice(0, 10);
const savedDay = (dir, s) => { const f = join(dir, `${slug(s)}.pdf`); return existsSync(f) ? day(statSync(f).mtimeMs) : null; };

// The name a browser saves a link under.
export const fileName = url => decodeURIComponent(url.split('/').pop()).normalize('NFC');

// Still to click: shops in these prefectures with neither prices nor a saved PDF, and hand-entered shops whose link
// changed and whose new PDF hasn't been saved since the prices were checked.
export function toDownload(shops, dir, prefs) {
  return shops.filter(s => s.brand === 'manekineko' && /\.pdf$/i.test(s.price_url)).filter(s => {
    const saved = savedDay(dir, s);
    if (s.manual) return s.manual.source !== s.price_url && !(saved > s.manual.checked_on);
    return !saved && prefs.some(p => s.address.startsWith(p));
  });
}

// Moves only recent real PDFs whose exact name is on the list. A replaced sheet keeps the old copy under its date.
export function collect(wanted, from, to, now = Date.now()) {
  const byName = Map.groupBy(wanted, s => fileName(s.price_url));
  const moved = [], unclear = [];
  for (const f of readdirSync(from)) {
    const name = f.normalize('NFC').replace(/ \(\d+\)(?=\.pdf$)/i, ''); // a second click saves "x (1).pdf"
    const shops = byName.get(name), path = join(from, f);
    if (!shops || now - statSync(path).mtimeMs > MAX_AGE_DAYS * 864e5) continue;
    if (shops.length > 1 || readFileSync(path).subarray(0, 5).toString() !== '%PDF-') { unclear.push(f); continue; }
    const target = join(to, `${slug(shops[0])}.pdf`);
    if (existsSync(target)) renameSync(target, join(to, `${slug(shops[0])}.${day(statSync(target).mtimeMs)}.pdf`));
    renameSync(path, target);
    byName.delete(name);
    moved.push(shops[0]);
  }
  return { moved, unclear };
}

const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);

export function page(wanted, prefs, waiting) {
  const row = s => `<li><a href="${esc(s.price_url)}">${esc(s.name)}</a> <span>${esc(s.address)}</span></li>`;
  const section = (title, list) => list.length ? `<h2>${esc(title)} · ${list.length}</h2><ul>${list.map(row).join('')}</ul>` : '';
  const inPref = p => wanted.filter(s => !s.manual && s.address.startsWith(p)).sort((a, b) => a.address.localeCompare(b.address, 'ja'));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Manekineko PDFs to click</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0 auto; padding: 16px; max-width: 720px; font: 16px/1.5 system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif; }
  ul { list-style: none; padding: 0; } li { border-bottom: 1px solid #8884; }
  a { display: inline-flex; align-items: center; min-height: 44px; font-weight: 600; } a:visited { color: #888; }
  span { font-size: 13px; opacity: .7; }
</style></head><body>
<h1>${wanted.length} PDFs to click</h1>
<p>Click each shop once. Grey means already clicked. When you stop, run <code>node scripts/manekineko-pdfs.js</code> and open this page again: it then shows only what is left.${waiting ? ` ${waiting} saved PDFs are waiting to be read.` : ''}</p>
${section('Price sheet replaced', wanted.filter(s => s.manual))}
${prefs.map(p => section(p, inPref(p))).join('')}
</body></html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
  const prefs = arg('pref', '大阪府,東京都').split(',');
  const from = arg('from', join(homedir(), 'Downloads')), to = join(ROOT, 'manual');
  const shops = JSON.parse(readFileSync(join(ROOT, 'data/shops.json'), 'utf8'));

  const { moved, unclear } = collect(toDownload(shops, to, prefs), from, to);
  const left = toDownload(shops, to, prefs);
  const out = join(to, 'manekineko-download-list.html');
  const waiting = shops.filter(s => s.brand === 'manekineko' && !s.manual && savedDay(to, s)).length;
  writeFileSync(out, page(left, prefs, waiting));

  console.log(`Moved ${moved.length} PDFs into manual/. ${waiting} saved PDFs are waiting to be read. ${left.length} still to click.`);
  if (unclear.length) console.log(`Left in Downloads, not moved (not a PDF, or the name fits two shops):\n  ${unclear.join('\n  ')}`);
  console.log(out);
}
