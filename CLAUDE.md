# K-map — notes for Claude sessions (local and cloud)

Phone map comparing karaoke shops (ジャンカラ, ビッグエコー, まねきねこ, カラオケ館) by price. README.md explains the
architecture, commands, data format and day-type rules; read it first.

## Data rules (from the owner, strict)
- Wrong data is worse than missing data. Never invent or guess a price; when unsure, skip and leave a pin + link.
- Keep the site's own text for cells without a number (`yen: null, text: "-"`); mark inferences (＊ † +1D, notes).
- Hand-entered prices (`data/manual-prices.json`) are published only after the owner checked them and said OK.

## Crawling etiquette
- User-Agent `K-map/0.1 (+https://github.com/Matthew-ms/k-map)`, at most one request per 3 s per host (crawler/common.js).
- Respect robots.txt: Manekineko's price PDFs (/wp-content/uploads/) are disallowed — never fetch them; the owner
  downloads them by hand into `manual/`.
- Never send the owner's email address to any site (not in headers, not in URLs).
- `manual/` PDFs, images and HTML and `crawler/cache/` are git-ignored: never commit them.

## Workflow
- Commit/push only when the owner asks (push to `main` deploys GitHub Pages: https://matthew-ms.github.io/k-map/).
- The owner tests on the phone via that Pages URL, not a LAN server.
- `npm test` before every commit; `node crawler/run.js --offline …` re-parses saved pages without fetching.
- The weekly GitHub Actions crawl (.github/workflows/crawl.yml, Mon 03:00 JST) commits `data/` by itself — pull first.

## Cloud sessions
- Run `npm ci` first. Node 22 (cloud default) is fine; CI uses 24.
- `crawler/cache/` and `manual/` don't exist there, so `--offline` has nothing to read. Fetching needs the
  environment's network access set to **Custom** with: jankara.ne.jp, big-echo.jp, shop.big-echo.jp,
  www.karaokemanekineko.jp, karaokekan.jp, karaokekan.net, holidays-jp.github.io.
- UI work (index.html, app.js, style.css, i18n.js, price.js) needs no network beyond the defaults, except that
  screenshots need cdnjs.cloudflare.com (Leaflet) and tile.openstreetmap.org (map tiles) allowed too.

## UI rules (redesign 2026-10, each with its reason)
- Colour channels never mix: chain colours (Jankara red, Big Echo blue, Manekineko amber, Karaoke-kan green) appear
  only on pins and chain badges; actions, prices and いま are ink (`--accent`, inverted in dark mode); warnings are
  amber and always written out. Reason: Jankara's red used to also be the action, price and いま colour, so a red
  thing could mean four things.
- Every tap target is at least 44 px (`--tap`), every text input at least 16 px. Reason: the audit found pins at
  30 px and header buttons at 38 px; under 16 px iPhones zoom in on focus.
- Pins that would overlap merge into an ink count bubble (Leaflet.markercluster, 32 px radius); tapping zooms in and
  shops in one building fan out. Without the add-on the map falls back to plain pins. Reason: 24 Namba pins stacked
  and taps landed on the wrong shop.
- Primary buttons name their result ("25店の料金を比較"), with the line break set per language in i18n.js.
- The language button is a globe (its word took 86 px of the header); the footer plan card says what the plan is
  ("今日 20:30〜 2時間"), not an instruction.

## Checking UI changes yourself
- After changing anything the owner sees, check it yourself in a phone-sized browser before asking them to test on
  the phone, and show them the screenshots you checked.
- Tool: Playwright with Chromium. In cloud sessions it is preinstalled (`require('playwright')`, `chromium.launch()`);
  don't install another version. When `HTTPS_PROXY` is set, launch with
  `proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }` or outside requests fail (the script
  below does this). On the owner's computer, use the Playwright MCP server.
- Use `node scripts/screenshot.js`: it serves the project locally, emulates an iPhone 13 with locale ja-JP and time
  zone Asia/Tokyo, and screenshots map, shop card, compare, plan, filters and identity in all 3 languages into
  `screenshots/` (git-ignored). Options at the top of the file: `--lang`, `--time` (fake clock), `--shop`, `--device`,
  `--url`. It collects page errors, console errors and failed requests, and exits 1 on any of them. Look at every
  screenshot of the screens the change touches, not just the exit code; add a screen to the script when a change
  touches one it doesn't capture.
- If CDN files or map tiles fail to load, the environment's network allowlist is blocking them: tell the owner which
  hosts to allow (cdnjs.cloudflare.com for Leaflet, tile.openstreetmap.org for tiles). Meanwhile for Leaflet:
  `npm pack leaflet@1.9.4` in the scratchpad, untar, pass `--leaflet=<that>/package/dist`.
- It is Chromium, not iOS Safari: say what still needs the real phone (Safari-only layout such as 100vh and safe
  areas, home-screen mode, real GPS, touch feel).
