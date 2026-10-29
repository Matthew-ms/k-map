// Phone screenshots of the site, so UI changes can be checked without a phone.
//   node scripts/screenshot.js                        # all languages, current time → screenshots/
//   node scripts/screenshot.js --lang=en --time=2026-10-31T20:00+09:00 --shop=難波
//   node scripts/screenshot.js --url=https://matthew-ms.github.io/k-map/
// Options: --url (default: serve this folder on a free local port), --device (Playwright device name, default
// "iPhone 13"), --lang=ja,en,zh-Hant, --time (fake clock, ISO with offset), --shop (part of a shop name for the
// card; default the Jankara nearest Namba), --out (default screenshots/), --leaflet=<dir with leaflet.js and
// leaflet.css> (when cdnjs is blocked). Exits 1 on a page error or a failed request other than map tiles.
// Needs Playwright with Chromium: preinstalled in cloud sessions; locally `npm i --no-save playwright` and
// `npx playwright install chromium`.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;

let chromium, devices;
try { ({ chromium, devices } = createRequire(import.meta.url)('playwright')); } catch {
  console.error('Playwright not found: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const device = devices[arg('device', 'iPhone 13')];
if (!device) { console.error(`Unknown device; try e.g. "iPhone 13", "Pixel 7"`); process.exit(2); }
const langs = arg('lang', 'ja,en,zh-Hant').split(',');
const out = resolve(arg('out', join(ROOT, 'screenshots')));
const time = arg('time');
const leaflet = arg('leaflet');
const NAMBA = [34.6695, 135.5015];

// The card's shop: by name, or the Jankara nearest Namba (it has prices; pin-only chains show none).
const shops = JSON.parse(await readFile(join(ROOT, 'data/shops.json'), 'utf8'));
const want = arg('shop');
const dist = s => (s.lat - NAMBA[0]) ** 2 + (s.lng - NAMBA[1]) ** 2;
const shop = want ? shops.find(s => s.name.includes(want))
  : shops.filter(s => s.brand === 'jankara').sort((a, b) => dist(a) - dist(b))[0];
if (!shop) { console.error(`No shop named like "${want}"`); process.exit(2); }

// Static server for this folder (no dependency); the app is plain files.
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let server, url = arg('url');
if (!url) {
  server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = join(ROOT, pathname.endsWith('/') ? `${pathname}index.html` : pathname); // test the URL: Windows paths use \
    if (!file.startsWith(ROOT)) return res.writeHead(403).end();
    let body;
    try { body = await readFile(file); } catch { return res.writeHead(404).end(); } // read first: headers can only be sent once
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(body);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}/`;
}

// Cloud sessions reach the internet only through their proxy, which Chromium doesn't pick up by itself.
const proxy = process.env.HTTPS_PROXY && { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' };
const browser = await chromium.launch(proxy ? { proxy } : {});
await mkdir(out, { recursive: true });
const problems = [];
let tilesFailed = 0;

for (const lang of langs) {
  const ctx = await browser.newContext({ ...device, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
    geolocation: { latitude: NAMBA[0], longitude: NAMBA[1] }, permissions: ['geolocation'] });
  await ctx.addInitScript(l => localStorage.setItem('kmap.lang', l), lang);
  const page = await ctx.newPage();
  if (time) await page.clock.setFixedTime(new Date(time));
  if (leaflet) {
    await page.route('**/leaflet.min.js', r => r.fulfill({ path: join(leaflet, 'leaflet.js') }));
    await page.route('**/leaflet.min.css', r => r.fulfill({ path: join(leaflet, 'leaflet.css') }));
  }
  page.on('pageerror', e => problems.push(`[${lang}] page error: ${e.message}`));
  page.on('console', m => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && problems.push(`[${lang}] console: ${m.text()}`));
  page.on('requestfailed', r => /tile\.openstreetmap/.test(r.url()) ? tilesFailed++
    : problems.push(`[${lang}] request failed: ${r.url()} (${r.failure()?.errorText})`));

  const shot = async (name, action) => {
    try {
      await page.keyboard.press('Escape'); // closes the panel and popovers
      if (action) await action();
      await page.waitForTimeout(400);
      const file = join(out, `${lang}-${name}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    } catch (e) { problems.push(`[${lang}] ${name}: ${e.message.split('\n')[0]}`); }
  };
  await page.goto(url, { waitUntil: 'networkidle' });
  await shot('map');
  await shot('card', () => page.locator(`.leaflet-marker-icon[title="${shop.name}"]`).first().dispatchEvent('click', {}, { timeout: 5000 })); // pins overlap in busy areas: a real tap could land on a neighbour
  await shot('compare', () => page.click('#compare-btn'));
  await shot('plan', () => page.click('#plan-card'));
  await shot('filter', () => page.click('#filter-btn'));
  await shot('me', () => page.click('#me-btn'));
  await ctx.close();
}
await browser.close();
server?.close();

if (tilesFailed) console.log(`(${tilesFailed} map tiles failed to load: is tile.openstreetmap.org reachable?)`);
if (problems.some(p => p.includes('cdnjs'))) console.log('(Leaflet failed to load: allow cdnjs.cloudflare.com, or pass --leaflet=<dir>)');
for (const p of [...new Set(problems)]) console.log(p);
process.exit(problems.length ? 1 : 0);
