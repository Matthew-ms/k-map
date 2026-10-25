# K-map

Phone-friendly map for comparing karaoke shops by brand, price, room type and machine.
MVP: Jankara, Osaka Namba/Shinsaibashi.

**Live:** https://matthew-ms.github.io/k-map/ (GitHub Pages, deploys on every push to `main`)

## How it works
- `crawler/` (Node) fetches each chain's shop data offline and writes `data/shops.json`.
- `price.js` holds the price rules (which row applies at a given moment) and is shared by the app and the tests.
- `data/holidays.json` (Japanese public holidays, from holidays-jp.github.io) is refreshed by the crawler.
- `i18n.js`: UI languages (日本語 default, English, 繁體中文). Strings are keyed by their Japanese text; `node` check: every `t('…')` in app.js needs an entry in each dictionary. Shop names and the chains' remarks are not translated.
- The site (`index.html`, `app.js`) is static: Leaflet + OpenStreetMap, reads `data/shops.json`, filters on the device.
- `data/shops.json` is the contract between the two halves.

## Run it
    npm run crawl              # fetch + parse + validate all chains → data/shops.json (~30 min, chains side by side)
    npm run crawl -- --offline # re-parse crawler/cache/ without fetching (after a parser fix)
    npm run crawl -- --brands=bigecho --offline  # one chain; the others keep their shops from the last run
    npm run crawl -- --brands=jankara --areas=10 --offline  # parser work on one Jankara area (writes only that area!)
    npm test                   # parser + price-rule tests
    npm run serve              # http://localhost:8080

## Chains
| Chain | Shop list | Prices |
|---|---|---|
| Jankara (212) | `jankara.ne.jp/shop/ajax/?a={area}` JSON | shop page tables, incl. Super Jankara grid |
| Big Echo | `shop.big-echo.jp/api/point?b=24,122,46,154` (all shops, with coordinates) | shop page tables; 学割→student; ひとりカラオケ(会員の場合) = 1名 member price; 1ドリンクオーダー制 → `drinks_included: false` (+1D) except 学生/シニア (drink bar) |
| Manekineko | admin-ajax `loc_load_more` per prefecture (nonce from /locations/) | **not read**: per-shop PDF under /wp-content/uploads/, which robots.txt disallows → pin + link |
| Karaoke-kan | sitemap `/shop/detail/{id}` | **not read**: price images → pin + link (hand-entered for some shops, see below) |

Hand-entered prices: `data/manual-prices.json` (8 Manekineko shops near Namba, typed from their official PDFs, checked 2026-10-17;
Karaoke-kan shops typed from their price images: 8 in Osaka, Kobe and Kyoto, checked 2026-10-18; all 84 in Tokyo, checked 2026-10-19 to 2026-10-20; all 20 in Saitama, checked 2026-10-22. The Tokyo and Saitama ones were each read twice independently and compared cell by cell). Karaoke-kan entries keep each
image's SHA-1: the monthly Karaoke-kan crawl warns when an image is new, gone or changed, so the entry gets re-read.
Merged on every run and validated like crawled data; the weekly log warns after 90 days. To refresh: save the shop's PDF / images into
`manual/` (git-ignored) and update the entry.

Machine names are normalised across chains (`LIVEDAM Ai` → `LIVE DAM Ai`). A customer type a chain lacks falls back to the closest
(学生会員 → student), marked † in the app.

## Weekly update
`.github/workflows/crawl.yml` runs every Monday 03:00 JST (and from the Actions tab → "Weekly crawl" → "Run workflow").
Jankara and Big Echo every week (~20 min); Manekineko and Karaoke-kan (pins, plus the image check above) on the first Monday of the month (~40 min),
or when "Also refresh Manekineko and Karaoke-kan" is ticked on a manual run. Each run:
tests → full crawl → commit `data/` if changed → Pages rebuild. If any shop fails to parse or validate, or more than
10% of shops disappear, the run fails, nothing is committed, and GitHub emails the repo owner.

## Data rules
- Missing values are `null`, never a guess.
- Every record keeps `source_url`, `prices_as_of`, `fetched_at`.
- Crawl weekly at most, 3 s between requests, raw HTML cached.

## Jankara notes
- Shop list: `https://jankara.ne.jp/shop/ajax/?a={area}` returns JSON only with header `X-Requested-With: XMLHttpRequest`.
  The `/shop/result/` HTML holds a stale image map; don't crawl it.
- Shop pages `/shop/{id}/`: price tables inside `#price-special` are solo (1-person) prices; the rest are group prices.
- `shopKidsRoom` in the JSON disagrees with the shop page; use the page. Some pages omit the kids-room item entirely → `null`.
- Slots may say 開店/閉店 (opening/closing); they are filled in from the shop hours.
- Each price row keeps the site's `period` (table title 朝/昼/夜/深夜) and `name` (row name). A cell with no number keeps the site's text (`yen: null, text: "-"`); never invent a number.
- Free-time rows keep `last_entry` (最終受付) and, when the page gives one, `last_entry_alt` for 土日祝 / 金土祝前. Other slot remarks (e.g. ※金土祝前は23時～5時) go to `slot_note`.
- 1名 tables list only slots with a solo surcharge. The app shows the 2名以上 price for the other slots, marked ＊.

## Day types (needed for "price now", phase 3)
`day` values: `weekday` 平日, `weekend_holiday` 土日祝, `sun_holiday` 日祝, `fri_sun_hol_eve` 金土日祝祝前, `fri_sat_hol_eve` 金土祝前.
- 平日 means "the days the other row of that slot doesn't cover", e.g. Mon–Thu in a 金土日祝祝前 table.
- Exception: in a 日祝 table, Saturday is in **neither** row (shop notes: 「土曜日の夕方フリータイムは実施しておりません」) → no price.
- Night slots belong to the evening they start: 02:00 Saturday uses Friday night's row.
- A slot can have several special-day columns (Big Echo: 月～木 / 金・祝前 / 土日祝); `slotTable` keeps them as `other`, `other2`…
- Big Echo rows keep the 平日 column's own days in `weekday_days` when it doesn't cover the whole week: a lone 月～金
  column has no Saturday price.

## Plan names
The chains' headings mix the plan with times, days, last entry and slogans. `slotName` (price.js) shows a short name
(「期間限定 おはカラフリータイム 最終受付12:00」 → おはカラフリータイム); when that drops real information (days, other time
windows, conditions), the card lists the site's own heading under the table. Big Echo's 最終受付 written in a heading
is read into `last_entry`.

## Phases
Done: 1. real-data map · 2. prices + shop card · 2.5 identity, site-style table, compare, area search, walking time ·
3. filters + price now · 4. all Jankara (212 shops) · 5. weekly GitHub Actions update · 7. plan (price for my visit):
pick a shop with この店にする, set date / start / 30分 steps or free time; the plan card shows the estimated total.
30分 stays are priced block by block by the slot running at each block's start.

Next: 6. more brands (one parser per chain, same validator; OpenStreetMap fallback for location-only shops).
