# Progress

## Done
- Jankara: all 213 shops priced by the crawler.
- Karaoke-kan: all 195 shops hand-entered from their price images (last batch 2026-11-01); the monthly crawl flags changed images.
- Manekineko: 164 shops hand-entered from their PDFs (7 Namba; 22 Osaka and 129 Tokyo published 2026-11-09, the last 6 Tokyo 2026-11-21); the other 562 are pins with a link. 千日前2号店 is hand-entered
  too but left the official site in the 2026-11 crawl, so it no longer shows.
- Manekineko one-click round (2026-11-08): `node scripts/manekineko-pdfs.js` moves the PDFs the owner clicked from Downloads
  into `manual/` and writes the list of what is left (`manual/manekineko-download-list.html`). Tried on real downloads 2026-11-08: file names match.
- Big Echo parser step 1 (2026-11-01, pushed): reads "週末（土・日・祝日）" / "【平日】" day labels and the time in a
  30分 table's first row; reads the drink rule from the heading; skips conditional 30分 tables (限定, 学生パスポート);
  reports rows it drops. On the saved pages: 11 more shops priced, wrong "30分" rows removed at 0613, 1168, 1213, 1361.
  `data/shops.json` is not rebuilt: the saved pages are older than the data, so the next weekly crawl applies it.
- Big Echo parser step 2 (2026-11-01): 30分 tables with the days in the heading and one column per drink plan.
  On the saved pages: 7 more shops priced (0585, 0916, 0926, 1221, 1344, 1428, 1449), 0667 gains its 日・祝 night rows.
- Big Echo member-only shops (2026-11-01): shops listing only 会員 prices keep them (52 on the saved pages; 一般 sees no
  price there). One-drink rule now read in all its spellings (ワンドリンク, ワンオーダー, 1オーダー) with who the notes spare:
  ~800 live rows were showing one-drink prices as drinks included, or the reverse.

- Weekly crawl fix (2026-11-21): the 2026-11-09 and 2026-11-16 runs failed (Jankara answered 403 on its shop list, then
  429 on 2 shop pages), so data stayed at 2026-11-02. Now refused pages are retried longer and a still-refused shop keeps
  last run's record. Checked: tests (incl. one that failed with the logic broken on purpose) and the retry / give-up
  timing against a local test server. Not verified: a real run on GitHub, and whether Jankara's refusals stop.

## Next
- Weekly crawl: the run by hand on 2026-11-21 passed (nothing refused, so keeping last run's records is still untried on
  GitHub). It logged >20% price moves at 3 Jankara shops (JR奈良店, 大街道店, 大街道二番町通り店) and 64 Big Echo shops, and
  4 Big Echo shops lost their prices (銀座数寄屋橋, 有楽町, 新有楽町, 四条烏丸); no parser changed since 2026-11-02, so
  probably the sites' own changes. Not compared with the live pages yet.
- Manekineko Tokyo: 経堂農大通り店 stays a pin (its prices are per room). 新小岩駅前店's sheet was only valid to 11/19: re-read it.
- Manekineko: 287 of 726 price links changed in the 2026-11 crawl. See after the next monthly crawl (2026-12-07) whether
  that repeats, and how many of the hand-entered shops are warned about.
- Big Echo: steps 1–2, member-only and the one-drink fix were already live in the 2026-11-02 crawl (396 priced then, 393
  now). Still to spot-check on live pages: 0613, 1168, 1213, 1361 have no wrong "30分" rows, and +1D / 込 match the notes.
- Big Echo: about 25 more pages with one-off layouts (spaced "O P E N", times that change by day); left as pins.
