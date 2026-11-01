import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayTokens, parseShopPage } from '../crawler/bigecho.js';

const page = (h4, firstRow, dayCols, rows) => `<div class="shop-detail"><div class="price"><h3>お一人様30分料金</h3><h4>${h4}</h4>
  <table><thead><tr><td>${firstRow}</td></tr></thead><tbody><tr><td></td>${dayCols.map(d => `<td>${d}</td>`).join('')}</tr>
  ${rows.map(([th, ...tds]) => `<tr><th>${th}</th>${tds.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;

test('Big Echo day labels with a 平日 / 週末 word in front', () => {
  assert.deepEqual([...dayTokens('週末（土・日・祝日）')].sort(), ['sat', 'sun', 'hol'].sort());
  assert.deepEqual([...dayTokens('【週末】土・日・祝')].sort(), ['sat', 'sun', 'hol'].sort());
  assert.deepEqual([...dayTokens('平日（月～金・祝前日）')].sort(), ['mon', 'tue', 'wed', 'thu', 'fri', 'eve'].sort());
  assert.deepEqual([...dayTokens('【平日】月〜金・祝前')].sort(), ['mon', 'tue', 'wed', 'thu', 'fri', 'eve'].sort());
  assert.deepEqual([...dayTokens('平日')].sort(), ['mon', 'tue', 'wed', 'thu', 'fri'].sort()); // a lone 平日 still means Mon–Fri
  assert.equal(dayTokens('週末'), null); // which days a lone 週末 means is not written: not a day label
});

test('Big Echo: time range in the table\'s first row (甲府駅南店 layout)', () => {
  const html = page('昼【30分料金】', '【OPEN～18:00】1ドリンクオーダー制', ['月～金・祝前日', '土・日・祝日'], [['一般', '200円', '300円']]);
  const { prices, skipped } = parseShopPage(html, '10:00-5:00');
  assert.deepEqual(skipped, []);
  assert.deepEqual(prices.map(p => [p.plan, p.customer, p.slot, p.yen]), [['30min', 'general', '10:00-18:00', 200], ['30min', 'general', '10:00-18:00', 300]]);
});

test('Big Echo: rows that don\'t fit the day columns are reported, not silently dropped', () => {
  const html = page('30分料金 OPEN〜18:00', 'ドリンクバー付', ['月～金', '何でもない日'], [['一般', '200円', '300円']]);
  const { prices, skipped } = parseShopPage(html, '10:00-5:00');
  assert.equal(prices.length, 0);
  assert.deepEqual(skipped, ['30分料金 OPEN〜18:00（列の数が合わない行 1）']);
});

test('Big Echo: a drink rule in the heading counts (鹿児島新栄店 layout); conditional prices are skipped', () => {
  const both = page('昼30分料金(1ドリンクオーダー制)', '10:00～18:00', ['月～金', '土・日・祝日'], [['一般', '200円', '300円']])
    + page('昼30分料金(ドリンクバー付き)', '10:00～18:00', ['月～金', '土・日・祝日'], [['一般', '250円', '350円']]);
  assert.deepEqual(parseShopPage(both, '10:00-5:00').prices.map(p => [p.yen, p.drinks_included]), [[200, false], [300, false], [250, true], [350, true]]);
  const pass = parseShopPage(page('30分料金 OPEN〜17:59 (学生パスポート利用時)', 'ドリンクバー付', ['月～金', '土・日・祝日'], [['学割', '168円', '288円']]), '10:00-5:00');
  assert.deepEqual([pass.prices.length, pass.skipped], [0, ['30分料金 OPEN〜17:59 (学生パスポート利用時)（条件付きの料金）']]);
});

test('Big Echo: an entry window in the first row is not a slot, and a 2-hour plan is not a 30-minute price (京成大久保駅前店)', () => {
  const html = page('2時間ドリンクバー付：おはカラプラン', '2時間ドリンクバー付：平日 受付時間10：00～11：59', ['月～金'], [['会員', '600円']]);
  assert.equal(parseShopPage(html, '10:00-5:00').prices.length, 0);
});

test('Big Echo: limited plans under a 30分 section are not 30-minute prices (淀屋橋駅前店, 千早店)', () => {
  const html = (h4, firstRow) => page(h4, firstRow, ['月～金', '土・日・祝日'], [['学割', '550円', '990円']]).replace('お一人様30分料金', '30分料金（税込）');
  const limited = parseShopPage(html('OPEN～20:00 【月～木限定】ハッピーアワー飲み放題', '20時までのご入室で2時間'), '10:00-5:00');
  assert.deepEqual([limited.prices.length, limited.skipped], [0, ['OPEN~20:00 【月~木限定】ハッピーアワー飲み放題（条件付きの料金）']]);
  // No time in the heading: the first row's time is only trusted for a 30分 table, not for a plan like this one.
  assert.equal(parseShopPage(html('学生限定プラン', 'OPEN～22:00まで※小中学生は18時まで'), '10:00-5:00').prices.length, 0);
});
