import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseShopPage } from '../crawler/jankara.js';

const fixture = id => readFileSync(new URL(`./fixtures/jankara-${id}.html`, import.meta.url), 'utf8');
const find = (prices, q) => prices.filter(p => Object.entries(q).every(([k, v]) => p[k] === v)).map(p => p.yen);

test('269 (道頓堀だるま店): group vs solo tables, night day types, rooms', () => {
  const r = parseShopPage(fixture(269), '24h');
  assert.equal(r.prices_as_of, '2026-10-15');
  assert.deepEqual(find(r.prices, { party: 'group', plan: '30min', slot: '08:00-10:00', day: 'weekday' }), [95, 270, 145, 145, 500]);
  assert.deepEqual(find(r.prices, { party: 'solo', plan: '30min', slot: '08:00-10:00', day: 'weekday' }), [125, 300, 175, 175, 530]);
  assert.deepEqual(find(r.prices, { plan: 'night_pack', day: 'fri_sat_hol_eve', customer: 'general' }), [3760]);
  assert.equal(find(r.prices, { plan: '30min', slot: '19:00-08:00', day: 'fri_sun_hol_eve', customer: 'general' })[0], 700);
  assert.deepEqual([r.rooms.total, r.rooms.concept, r.rooms.featured.length], [20, 3, 3]);
  assert.deepEqual(r.rooms.featured[0], { no: '301', type: 'マットルーム', capacity: '1-3', machine: 'JOYSOUND MAX GO', surcharge: '30分毎＋80円/フリータイム＋400円' });
  assert.equal(r.kids_room, true);
});

test('45 (アメリカ村店): 開店/閉店 slots resolve from hours', () => {
  const slots = new Set(parseShopPage(fixture(45), '11:00-5:00').prices.filter(p => p.plan === '30min').map(p => p.slot));
  assert.deepEqual([...slots].sort(), ['11:00-19:00', '19:00-05:00']);
});

test('45: a cell without a number keeps the site text, never a made-up price', () => {
  const short = parseShopPage(fixture(45), '11:00-5:00').prices.filter(p => p.name === 'ショートフリータイム' && p.yen === null);
  assert.ok(short.length > 0);
  assert.ok(short.every(p => p.text === '-' && p.period === '昼'));
});

test('18 (JR奈良店): of the date tabs ("12/3まで" / "12/4〜12/18"), only the one the page opens on is read', () => {
  const html = fixture(18);
  const at = html.indexOf('id="tab2"');
  // Make the December tab differ, as it will once Jankara posts other prices for it.
  const dec = html.slice(0, at) + html.slice(at).replace(/class="fontPrice">[^<]*</, 'class="fontPrice">9,999<');
  const r = parseShopPage(dec, '24h');
  assert.equal(r.prices.filter(p => p.yen === 9999).length, 0);
  assert.equal(r.prices.length, new Set(r.prices.map(p => JSON.stringify(p))).size); // no row twice
  assert.deepEqual(find(r.prices, { party: 'group', plan: '30min', slot: '10:00-19:00', day: 'weekday' }), [210, 290, 220, 220, 300]);
  assert.deepEqual(find(r.prices, { party: 'solo', plan: '30min', slot: '08:00-10:00', day: 'weekend_holiday' }), [240, 440, 250, 250, 450]);
});
