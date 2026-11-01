# Progress

## Done
- Jankara: all 213 shops priced by the crawler.
- Karaoke-kan: all 195 shops hand-entered from their price images (last batch 2026-11-01); the monthly crawl flags changed images.
- Manekineko: 8 Namba shops hand-entered from their PDFs; the other 719 are pins with a link.
- Big Echo parser step 1 (2026-11-01, pushed): reads "週末（土・日・祝日）" / "【平日】" day labels and the time in a
  30分 table's first row; reads the drink rule from the heading; skips conditional 30分 tables (限定, 学生パスポート);
  reports rows it drops. On the saved pages: 11 more shops priced, wrong "30分" rows removed at 0613, 1168, 1213, 1361.
  `data/shops.json` is not rebuilt: the saved pages are older than the data, so the next weekly crawl applies it.

## Next
- After the Monday 2026-11-02 crawl: check that the 11 Big Echo shops got prices and the 4 lost their wrong "30分" rows.
- Big Echo step 2: tables with the days in the heading and one price column (須賀川店 0916, 1221, 1344, …).
- Big Echo: owner to decide on the 66 shops that list only 会員 prices, and the 4 that give 一般 as "会員 + ¥50" in words.
- Big Echo: about 25 more pages with one-off layouts (spaced "O P E N", times that change by day); left as pins.
