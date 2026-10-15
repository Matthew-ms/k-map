# K-map

Phone-friendly map for comparing karaoke shops by brand, price, room type and machine.
MVP: Jankara, Osaka Namba/Shinsaibashi.

**Live:** https://matthew-ms.github.io/k-map/ (GitHub Pages, deploys on every push to `main`)

## How it works
- `crawler/` (Node) fetches each chain's shop data offline and writes `data/shops.json`.
- `price.js` holds the price rules (which row applies at a given moment) and is shared by the app and the tests.
- `data/holidays.json` (Japanese public holidays, from holidays-jp.github.io) is refreshed by the crawler.
- The site (`index.html`, `app.js`) is static: Leaflet + OpenStreetMap, reads `data/shops.json`, filters on the device.
- `data/shops.json` is the contract between the two halves.

## Run it
    npm run crawl              # fetch + parse + validate → data/shops.json (Jankara area 10, ~45 s)
    npm run crawl -- --offline # re-parse crawler/cache/ without fetching (after a parser fix)
    npm test                   # parser + price-rule tests
    npm run serve              # http://localhost:8080

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

## Phases
1. Real-data map (done) · 2. Prices + shop card (done) · 2.5 UI: identity, site-style table, compare, area search, walking time (done) · 3. Filters + price now (done) ·
Plan (price for my visit, done early): pick a shop with この店にする, set date / start / 30分 steps or free time; the plan card shows the estimated total for the party. 30分 stays are priced block by block by the slot running at each block's start.

4. All Jankara · 5. Weekly GitHub Actions + Pages · 6. More brands · 7. Price for my visit
