# Progress

## Done
- Jankara: all 213 shops priced by the crawler.
- Karaoke-kan: all 195 shops hand-entered from their price images (last batch 2026-11-01); the monthly crawl flags changed images.
- Manekineko: 7 Namba shops hand-entered from their PDFs; the other 719 are pins with a link. 千日前2号店 is hand-entered
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

## Next
- Manekineko: owner clicks the remaining 156 links (Osaka, then Tokyo); 茨木園田店 and 京阪守口店 are already saved;
  then read each PDF twice, as with Karaoke-kan, for the owner's OK.
- Manekineko: 287 of 726 price links changed in the 2026-11 crawl. See after the next monthly crawl (2026-12-07) whether
  that repeats, and how many of the hand-entered shops are warned about.
- After that crawl: check that about 70 more Big Echo shops have prices (18 from steps 1–2, 52 member-only), 0613, 1168,
  1213, 1361 lost their wrong "30分" rows, and the one-drink fix moved ~800 rows to +1D or 込 as their notes say.
- Big Echo: about 25 more pages with one-off layouts (spaced "O P E N", times that change by day); left as pins.
