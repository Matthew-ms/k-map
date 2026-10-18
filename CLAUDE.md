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
- UI work (index.html, app.js, style.css, i18n.js, price.js) needs no network beyond the defaults.
