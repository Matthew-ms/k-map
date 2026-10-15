# K-map

Phone-friendly map for comparing karaoke shops by brand, price, room type and machine.
MVP: Jankara, Osaka Namba/Shinsaibashi.

**Live:** https://matthew-ms.github.io/k-map/ (GitHub Pages, deploys on every push to `main`)

## How it works
- `crawler/` (Node) fetches each chain's shop data offline and writes `data/shops.json`.
- The site (`index.html`, `app.js`) is static: Leaflet + OpenStreetMap, reads `data/shops.json`, filters on the device.
- `data/shops.json` is the contract between the two halves.

## Run it
    npm run crawl              # fetch + parse + validate → data/shops.json (Jankara area 10, ~45 s)
    npm run crawl -- --offline # re-parse crawler/cache/ without fetching (after a parser fix)
    npm test                   # parser tests against test/fixtures/
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

## Day types (needed for "price now", phase 3)
`day` values: `weekday` 平日, `weekend_holiday` 土日祝, `sun_holiday` 日祝, `fri_sun_hol_eve` 金土日祝祝前, `fri_sat_hol_eve` 金土祝前.
- 平日 means "the days the other row of that slot doesn't cover", e.g. Mon–Thu in a 金土日祝祝前 table.
- Exception: in a 日祝 table, Saturday is in **neither** row (shop notes: 「土曜日の夕方フリータイムは実施しておりません」) → no price.
- Night slots belong to the evening they start: 02:00 Saturday uses Friday night's row.

## Phases
1. Real-data map (done) · 2. Prices + shop card (done) · 3. Filters, near me, pin price ·
4. All Jankara · 5. Weekly GitHub Actions + Pages · 6. More brands · 7. Price for my visit
