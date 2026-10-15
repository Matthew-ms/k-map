import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { whichDay, currentPrice } from '../price.js';
import { parseShopPage } from '../crawler/jankara.js';

// 2026-10-15 is a Thursday. 2026-11-03 (Tue) is 文化の日, so Mon 11-02 is a 祝前 (holiday eve).
const holidays = { '2026-11-03': '文化の日' };
const at = (ymd, hhmm) => new Date(`${ymd}T${hhmm}:00+09:00`);
const day = (slot, otherDay, ymd, hhmm) => whichDay({ slot, otherDay }, at(ymd, hhmm), holidays);

test('night slot 19:00–8:00 (休日=金土日祝祝前): the day type belongs to the evening it started', () => {
  assert.equal(day('19:00-08:00', 'fri_sun_hol_eve', '2026-10-15', '20:00'), 'weekday'); // Thu evening
  assert.equal(day('19:00-08:00', 'fri_sun_hol_eve', '2026-10-16', '20:00'), 'other'); // Fri evening
  assert.equal(day('19:00-08:00', 'fri_sun_hol_eve', '2026-10-17', '02:00'), 'other'); // Sat 02:00 = Friday night
  assert.equal(day('19:00-08:00', 'fri_sun_hol_eve', '2026-10-16', '02:00'), 'weekday'); // Fri 02:00 = Thursday night
  assert.equal(day('19:00-08:00', 'fri_sun_hol_eve', '2026-11-02', '21:00'), 'other'); // Mon, eve of 文化の日
  assert.equal(day('19:00-08:00', 'fri_sun_hol_eve', '2026-10-20', '07:59'), 'weekday'); // Tue morning = Monday night
  assert.equal(day('19:00-08:00', 'fri_sun_hol_eve', '2026-10-20', '08:00'), null); // slot over
});

test('night pack 22:00–10:00 (休日=金土祝前): Sunday night is 平日, Saturday night is not', () => {
  assert.equal(day('22:00-10:00', 'fri_sat_hol_eve', '2026-10-18', '23:00'), 'weekday'); // Sun night
  assert.equal(day('22:00-10:00', 'fri_sat_hol_eve', '2026-10-18', '01:00'), 'other'); // Sun 01:00 = Saturday night
});

test('day slot (休日=土日祝): holidays count, the eve does not', () => {
  assert.equal(day('10:00-19:00', 'weekend_holiday', '2026-11-03', '12:00'), 'other');
  assert.equal(day('10:00-19:00', 'weekend_holiday', '2026-11-02', '12:00'), 'weekday');
  assert.equal(day('10:00-19:00', 'weekend_holiday', '2026-10-17', '12:00'), 'other');
});

test('休日=日祝 table: Saturday has no price at all', () => {
  assert.equal(day('16:00-21:00', 'sun_holiday', '2026-10-17', '18:00'), null);
  assert.equal(day('16:00-21:00', 'sun_holiday', '2026-10-18', '18:00'), 'other');
  assert.equal(day('16:00-21:00', 'sun_holiday', '2026-10-16', '18:00'), 'weekday');
});

test('currentPrice on 269 (道頓堀だるま店), incl. 1名 fallback to the group price', () => {
  const shop = { prices: parseShopPage(readFileSync(new URL('./fixtures/jankara-269.html', import.meta.url), 'utf8'), '24h').prices };
  const price = (party, customer, ymd, hhmm) => currentPrice(shop, { party, customer, now: at(ymd, hhmm), holidays })?.row;
  assert.equal(price('group', 'general', '2026-10-15', '12:00').yen, 500);
  assert.equal(price('solo', 'student_member', '2026-10-15', '12:00').yen, 220);
  const night = price('solo', 'student_member', '2026-10-16', '20:00'); // no 1名 row at night → 2名以上 price, marked
  assert.deepEqual([night.yen, night.fallback], [310, true]);
});
