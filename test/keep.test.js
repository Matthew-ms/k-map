import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepLastGood } from '../crawler/common.js';

const shop = (id, fetched_at = '2026-11-02') => ({ id: `jankara-${id}`, brand: 'jankara', source_url: `https://jankara.ne.jp/shop/${id}/`, fetched_at });
const prev = Array.from({ length: 20 }, (_, i) => shop(i + 1));
const refused = id => `https://jankara.ne.jp/shop/${id}/ (店): https://jankara.ne.jp/shop/${id}/: HTTP 429`;
const fresh = ids => ids.map(id => ({ ...shop(id), fetched_at: '2026-11-16' }));
const now = '2026-11-16';

test('a refused shop page keeps last run\'s record and the run goes on', () => {
  const r = keepLastGood('jankara', { shops: fresh([1, 2, 3]), errors: [refused(4), refused(5)] }, prev, now);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.shops.map(s => s.id).slice(3), ['jankara-4', 'jankara-5']);
  assert.equal(r.shops[3].fetched_at, '2026-11-02'); // still says how old it is
  assert.equal(r.kept, 2);
  assert.match(r.warnings[0], /kept the record from the last good run \(2026-11-02\)/);
});

test('a refused shop list keeps the whole chain; other failures still block', () => {
  const r = keepLastGood('jankara', { shops: [], errors: ['jankara: https://jankara.ne.jp/shop/: HTTP 403'] }, prev, now);
  assert.deepEqual(r.errors, []);
  assert.equal(r.shops.length, 20);
  // a parse error, a 404, an unknown shop: not a refusal, so still a problem
  for (const e of ['https://jankara.ne.jp/shop/4/ (店): no price table', 'https://jankara.ne.jp/shop/4/ (店): https://jankara.ne.jp/shop/4/: HTTP 404', refused(99)])
    assert.deepEqual(keepLastGood('jankara', { shops: [], errors: [e] }, prev, now).errors, [e]);
});

test('records over 28 days old, or more than 10% of pages refused, block the write', () => {
  const old = [shop(1, '2026-10-18'), ...prev.slice(1)];
  assert.equal(keepLastGood('jankara', { shops: [], errors: [refused(1)] }, old, now).errors.length, 1);
  assert.equal(keepLastGood('jankara', { shops: [], errors: [refused(2)] }, old, now).errors.length, 0); // 2026-11-02 is fine
  const r = keepLastGood('jankara', { shops: fresh([1]), errors: [2, 3, 4].map(refused) }, prev, now); // 3 of 20 > 10%
  assert.equal(r.errors.length, 4);
  assert.equal(r.shops.length, 1);
});
