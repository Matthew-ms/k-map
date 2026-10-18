// manual/karaokekan-check.html: each hand-entered Karaoke-kan shop's price images beside the typed-in values, for
// checking by eye. Images are expected at manual/karaokekan-{id}-{n}.jpg (git-ignored).
// Usage: node crawler/karaokekan-check.js [--only=182,233] [--flag=flags.json]
//   --flag: { "karaokekan-182": ["昼 30分 11:00-19:00 member"], … } cells to highlight (e.g. where two readings differ)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const arg = name => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const only = arg('only')?.split(',');
const flags = arg('flag') ? JSON.parse(readFileSync(arg('flag'), 'utf8')) : {};
const manual = JSON.parse(readFileSync(new URL('data/manual-prices.json', root), 'utf8'));
const shops = new Map(JSON.parse(readFileSync(new URL('data/shops.json', root), 'utf8')).map(s => [s.id, s]));
const CUST = { student: '学生', senior: 'シニア', member: '会員', general: '一般' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const v = x => (x == null ? '' : typeof x === 'number' ? x.toLocaleString() : esc(x));

const sections = Object.entries(manual).filter(([k]) => k.startsWith('karaokekan-') && (!only || only.includes(k.split('-')[1]))).map(([key, e]) => {
  const id = key.split('-')[1], shop = shops.get(key) ?? { name: key, hours: '' };
  const flagged = new Set(flags[key] ?? []);
  const cust = Object.keys(CUST).filter(c => e.slots.some(s => s[c]));
  const rows = e.slots.map(s => {
    const [, label] = e.days[s.days];
    const last = Array.isArray(s.last) ? s.last.map(x => x ?? '—').join(' / ') : s.last ?? '';
    const cellCls = c => (flagged.has(`${s.period} ${s.name} ${s.slot} ${c}`) ? ' class="flag"' : '');
    return `<tr><td>${esc(s.name)}<br><small>${s.slot.replace('-', '–')}</small></td><td><small>平日 / ${esc(label)}</small></td>
      ${cust.map(c => `<td${cellCls(c)}>${s[c] ? `${v(s[c][0])} / ${v(s[c][1])}` : ''}</td>`).join('')}
      <td>${esc(last)}</td><td>${(s.drinks ?? e.drinks_included) ? 'ドリンクバー' : '1ドリンク制'}</td><td><small>${esc(s.note ?? '')}</small></td></tr>`;
  }).join('');
  const imgs = Object.keys(e.images ?? {}).map(u => `manual/karaokekan-${id}-${u.split('/').pop()}.jpg`).filter(p => existsSync(new URL(p, root)));
  return `<section${flagged.size ? ' class="has-flag"' : ''}><h2>${esc(shop.name)} <small>(${id}) · ${esc(shop.hours ?? '')}</small>${flagged.size ? ` <span class="badge">要確認 ${flagged.size}</span>` : ''}</h2>
  <div class="imgs">${imgs.map(p => `<a href="${p.slice(7)}" target="_blank"><img src="${p.slice(7)}"></a>`).join('') || '<p>画像なし（manual/ に保存してください）</p>'}</div>
  <table><thead><tr><th>プラン</th><th>曜日（平日 / 休日）</th>${cust.map(c => `<th>${CUST[c]}</th>`).join('')}<th>最終受付</th><th>ドリンク</th><th>注記</th></tr></thead>
  <tbody>${rows}</tbody></table><ul>${e.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>
  <label><input type="checkbox"> この店は確認済み</label></section>`;
});

writeFileSync(new URL('manual/karaokekan-check.html', root), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>カラオケ館 手入力チェック</title><style>
body{font:14px system-ui,sans-serif;margin:16px;background:#fff;color:#111}section{border-top:2px solid #16a34a;padding:8px 0 24px}
.imgs{display:flex;gap:8px;overflow-x:auto}.imgs img{height:520px}table{border-collapse:collapse;margin:8px 0}
td,th{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}small{color:#555}
.flag{background:#fde68a;outline:2px solid #d97706}.badge{background:#d97706;color:#fff;border-radius:4px;padding:1px 6px;font-size:13px}
</style><h1>カラオケ館 手入力チェック</h1><p>画像をクリックすると原寸で開きます。数字は「平日 / 休日」。空欄はその区分の記載なし、「-」は料金表どおり。<b>黄色のセル</b>は2回の読み取りが一致しなかった箇所です。</p>
${sections.join('\n')}`);
console.log(`manual/karaokekan-check.html: ${sections.length} shop(s)`);
