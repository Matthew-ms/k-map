import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collect, fileName, removeCopies, toDownload } from '../scripts/manekineko-pdfs.js';
import { applyManual } from '../crawler/manual.js';

const U = 'https://www.karaokemanekineko.jp/wp-content/uploads/2025/11/05135719/';
const shop = (name, file, more) => ({ id: `manekineko-${name}`, brand: 'manekineko', name, address: '東京都新宿区1', price_url: U + file, ...more });
const dirs = () => { const d = mkdtempSync(join(tmpdir(), 'kmap-')); mkdirSync(join(d, 'dl')); mkdirSync(join(d, 'manual')); return [join(d, 'dl'), join(d, 'manual')]; };
const PDF = '%PDF-1.7 x';

test('the browser file name is the decoded last part of the link', () => {
  assert.equal(fileName(`${U}%E3%80%90%E5%87%BD%E9%A4%A8%E3%80%91.pdf`), '【函館】.pdf');
});

test('moves a matching PDF under the shop name, also after a second click', () => {
  const [dl, manual] = dirs();
  writeFileSync(join(dl, '769-11 (1).pdf'), PDF);
  const r = collect([shop('a-store', '769-11.pdf')], dl, manual);
  assert.equal(r.moved.length, 1);
  assert.equal(readFileSync(join(manual, 'a-store.pdf'), 'utf8'), PDF);
  assert.ok(!existsSync(join(dl, '769-11 (1).pdf')));
});

test('leaves everything else in Downloads', () => {
  const [dl, manual] = dirs();
  for (const f of ['unrelated.pdf', 'fake.pdf', 'old.pdf', '1024.pdf']) writeFileSync(join(dl, f), f === 'fake.pdf' ? '<html>' : PDF);
  utimesSync(join(dl, 'old.pdf'), new Date('2020-01-01'), new Date('2020-01-01'));
  const r = collect([shop('b', 'fake.pdf'), shop('c', 'old.pdf'), shop('d', '1024.pdf'), shop('e', '1024.pdf')], dl, manual);
  assert.deepEqual(r.moved, []);
  assert.deepEqual(r.unclear.sort(), ['1024.pdf', 'fake.pdf']); // not a PDF; fits two shops
  for (const f of ['unrelated.pdf', 'fake.pdf', 'old.pdf', '1024.pdf']) assert.ok(existsSync(join(dl, f)));
});

test('deletes only identical copies of PDFs already saved', () => {
  const [dl, manual] = dirs();
  writeFileSync(join(manual, 'a.pdf'), PDF);
  writeFileSync(join(dl, '769-11.pdf'), PDF);
  writeFileSync(join(dl, '769-11 (1).pdf'), PDF);
  writeFileSync(join(dl, '769-11 (2).pdf'), `${PDF} different`);
  writeFileSync(join(dl, 'unrelated.pdf'), PDF);
  const removed = removeCopies([shop('a', '769-11.pdf')], dl, manual);
  assert.deepEqual(removed.sort(), ['769-11 (1).pdf', '769-11.pdf']);
  assert.ok(existsSync(join(dl, '769-11 (2).pdf')) && existsSync(join(dl, 'unrelated.pdf')) && existsSync(join(manual, 'a.pdf')));
});

test('a replaced sheet keeps the old copy', () => {
  const [dl, manual] = dirs();
  writeFileSync(join(manual, 'a.pdf'), 'old');
  utimesSync(join(manual, 'a.pdf'), new Date('2026-10-17T03:00Z'), new Date('2026-10-17T03:00Z'));
  writeFileSync(join(dl, 'new.pdf'), PDF);
  collect([shop('a', 'new.pdf')], dl, manual);
  assert.equal(readFileSync(join(manual, 'a.2026-10-17.pdf'), 'utf8'), 'old');
  assert.equal(readFileSync(join(manual, 'a.pdf'), 'utf8'), PDF);
});

test('to click: priced or saved shops drop out, a changed link comes back until its new PDF is saved', () => {
  const [, manual] = dirs();
  const checked = { checked_on: '2026-10-17', source: `${U}x.pdf` };
  const todo = shop('todo', 'a.pdf'), saved = shop('saved', 'b.pdf'), other = shop('other', 'c.pdf', { address: '北海道札幌市' });
  const same = shop('same', 'x.pdf', { manual: checked }), changed = shop('changed', 'y.pdf', { manual: checked, address: '北海道札幌市' });
  writeFileSync(join(manual, 'saved.pdf'), PDF);
  const names = () => toDownload([todo, saved, other, same, changed], manual, ['東京都']).map(s => s.name);
  assert.deepEqual(names(), ['todo', 'changed']);
  writeFileSync(join(manual, 'changed.pdf'), PDF); // saved today, after checked_on
  assert.deepEqual(names(), ['todo']);
});

test('a hand-entered shop keeps the live link and warns when it differs from the one typed from', () => {
  const entry = JSON.parse(readFileSync(new URL('../data/manual-prices.json', import.meta.url), 'utf8'))['manekineko-dotonbori-store'];
  const s = { id: 'manekineko-dotonbori-store', name: '道頓堀店', price_url: `${U}new.pdf` };
  const warnings = applyManual([s]).filter(w => w.includes('link changed'));
  assert.equal(s.price_url, `${U}new.pdf`);
  assert.equal(s.manual.source, entry.source);
  assert.equal(warnings.length, 1);
});
