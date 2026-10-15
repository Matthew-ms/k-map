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
