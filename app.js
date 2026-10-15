import { slotTable, currentPrice, whichDay, isDayType, jst, bySiteOrder } from './price.js';

const BRAND_COLORS = { jankara: '#e60012' };
const BRAND_NAMES = { jankara: 'ジャンカラ' };
const CUSTOMERS = { student_member: '学生会員', student: '学生', member: '会員', senior: 'シニア', general: '一般' };
const PARTIES = { solo: '1名', group: '2名以上' };
const DAY = { weekday: '平日', weekend_holiday: '土日祝', sun_holiday: '日祝', fri_sun_hol_eve: '金土日祝祝前', fri_sat_hol_eve: '金土祝前' };
const PLAN_TABS = { '30min': '30分', free_time: 'フリータイム', night_pack: 'ナイトパック' };
const FALLBACK_NOTE = '＊1名料金の記載なし・2名以上と同額';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const slotText = s => s.replace(/(^|-)0/g, '$1').replace('-', '–');
const cell = r => !r ? '' : r.yen == null ? esc(r.text) : r.yen.toLocaleString() + (r.fallback ? '＊' : '');

// ---- My identity: who is going (saved on this device only) ----
const ID_KEY = 'kmap.identity';
let me = { party: 'solo', customer: 'student_member' };
try { Object.assign(me, JSON.parse(localStorage.getItem(ID_KEY)) ?? {}); } catch {}
const saveMe = () => { try { localStorage.setItem(ID_KEY, JSON.stringify(me)); } catch {} };
const meLabel = () => `${PARTIES[me.party]}・${CUSTOMERS[me.customer]}`;

// ---- Map ----
const map = L.map('map');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const [shops, holidays] = await Promise.all(['data/shops.json', 'data/holidays.json'].map(u => fetch(u).then(r => r.json())));
const panel = document.getElementById('panel');
const compareBtn = document.getElementById('compare-btn');
const areaBtn = document.getElementById('area-btn');
const meBtn = document.getElementById('me-btn');
const filterBtn = document.getElementById('filter-btn');
const toast = document.getElementById('toast');

for (const s of shops) {
  s.pin = L.circleMarker([s.lat, s.lng], { radius: 10, color: '#fff', weight: 2, fillColor: BRAND_COLORS[s.brand] ?? '#666', fillOpacity: 1, bubblingMouseEvents: false })
    .on('click', () => openCard(s));
}

// 30分 price for my identity at this moment (null when no 30分 slot is running, e.g. closed)
const nowPrice = s => currentPrice(s, { party: me.party, customer: me.customer, holidays });

// ---- Filters (this visit only) ----
const filters = { brands: new Set(), machines: new Set(), maxYen: null };
const family = m => (m.startsWith('JOYSOUND') ? 'JOYSOUND' : m.includes('DAM') ? 'DAM' : m);
function passes(s) {
  if (filters.brands.size && !filters.brands.has(s.brand)) return false;
  if (filters.machines.size && !s.machines.some(m => filters.machines.has(m) || filters.machines.has(family(m)))) return false;
  if (filters.maxYen != null) {
    const y = nowPrice(s)?.row.yen;
    if (y == null || y > filters.maxYen) return false;
  }
  return true;
}

// The shop set = what was on screen at the last "search this area", narrowed by the filters.
let area, inArea = [], shown = [], userPos = null, view = null, quietMoves = 0;
function refresh() {
  shown = inArea.filter(passes);
  for (const s of shops) shown.includes(s) ? s.pin.addTo(map) : s.pin.remove();
  compareBtn.textContent = `料金を比較（${shown.length}店）`;
  compareBtn.disabled = !shown.length;
  const active = filters.brands.size + filters.machines.size + (filters.maxYen != null);
  filterBtn.textContent = active ? `絞り込み（${active}）` : '絞り込み';
  filterBtn.classList.toggle('on', !!active);
  if (view?.type === 'compare') openCompare();
}
function searchArea() {
  area = map.getBounds();
  inArea = shops.filter(s => area.contains([s.lat, s.lng]));
  areaBtn.hidden = true;
  refresh();
}
const quietly = fn => { quietMoves++; fn(); }; // programmatic moves shouldn't offer "search this area"
map.on('moveend', () => { if (quietMoves) quietMoves--; else if (area) areaBtn.hidden = false; });
quietly(() => map.fitBounds(L.featureGroup(shops.map(s => s.pin)).getBounds(), { padding: [30, 30] }));
searchArea();
areaBtn.onclick = searchArea;
setInterval(refresh, 60_000); // "now" prices move with the clock

// ---- Current location → walking time ----
let userDot;
const LocateControl = L.Control.extend({
  onAdd() {
    const b = L.DomUtil.create('button', 'locate-btn');
    b.type = 'button';
    b.title = '現在地';
    b.setAttribute('aria-label', '現在地');
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" stroke-width="2"/></svg>';
    L.DomEvent.disableClickPropagation(b);
    b.onclick = locate;
    return b;
  },
});
new LocateControl({ position: 'topleft' }).addTo(map);

function locate() {
  if (!navigator.geolocation) return showToast('この端末では位置情報を使えません');
  navigator.geolocation.getCurrentPosition(pos => {
    userPos = L.latLng(pos.coords.latitude, pos.coords.longitude);
    userDot ??= L.circleMarker(userPos, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1, interactive: false }).addTo(map);
    userDot.setLatLng(userPos);
    map.setView(userPos, Math.max(map.getZoom(), 16));
    rerender();
  }, () => showToast('位置情報を取得できませんでした。ブラウザの設定で位置情報を許可してください。'), { enableHighAccuracy: true, timeout: 10000 });
}

// Straight-line distance × 1.25 for streets, at 80 m per minute (the usual Japanese walking-time standard).
function walk(shop) {
  if (!userPos) return null;
  const m = userPos.distanceTo([shop.lat, shop.lng]) * 1.25;
  return m > 4800 ? `約${(m / 1000).toFixed(1)}km` : `徒歩約${Math.max(1, Math.ceil(m / 80))}分`;
}

function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => (toast.hidden = true), 4000);
}

const rerender = () => { if (view) view.type === 'card' ? openCard(view.shop, view.from) : openCompare(); };

// ---- Small popovers under the top-right buttons ----
function popover(id, render, onClick) {
  const open = document.getElementById(id);
  document.querySelectorAll('.popover').forEach(p => p.remove());
  if (open) return;
  const p = document.createElement('div');
  p.id = id;
  p.className = 'popover';
  p.innerHTML = render();
  p.addEventListener('click', e => onClick(e, p));
  document.body.append(p);
  return p;
}

// Identity picker
const renderMeBtn = () => (meBtn.textContent = meLabel());
renderMeBtn();
meBtn.onclick = () => popover('me-panel', () => `
    <p class="label">人数</p><div class="toggle">${Object.entries(PARTIES).map(([k, v]) => `<button data-party="${k}" aria-pressed="${me.party === k}">${v}</button>`).join('')}</div>
    <p class="label">区分</p><div class="toggle wrap">${Object.entries(CUSTOMERS).map(([k, v]) => `<button data-customer="${k}" aria-pressed="${me.customer === k}">${v}</button>`).join('')}</div>
    <p class="meta">この端末に保存されます</p>`, (e, p) => {
  const b = e.target.closest('button');
  if (!b) return;
  Object.assign(me, b.dataset.party ? { party: b.dataset.party } : { customer: b.dataset.customer });
  saveMe();
  renderMeBtn();
  p.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.party ? me.party === x.dataset.party : me.customer === x.dataset.customer));
  refresh(); // the max-price filter depends on who is going
  rerender();
});

// Filter panel
const brands = [...new Set(shops.map(s => s.brand))];
const machines = [...new Set(shops.flatMap(s => s.machines))].sort();
const families = [...new Set(machines.map(family))].filter(f => !machines.includes(f));
function renderFilters() {
  const prices = shops.map(s => nowPrice(s)?.row.yen).filter(y => y != null);
  const lo = Math.floor(Math.min(...prices, 100) / 10) * 10, hi = Math.ceil(Math.max(...prices, 1000) / 10) * 10;
  const chip = (kind, value, label, on) => `<button data-${kind}="${esc(value)}" aria-pressed="${on}">${esc(label)}</button>`;
  return `
    <p class="label">ブランド</p><div class="chips-toggle">${brands.map(b => chip('brand', b, BRAND_NAMES[b] ?? b, filters.brands.has(b))).join('')}</div>
    <p class="label">機種</p><div class="chips-toggle">
      ${families.map(f => chip('machine', f, `${f}系すべて`, filters.machines.has(f))).join('')}
      ${machines.map(m => chip('machine', m, m, filters.machines.has(m))).join('')}</div>
    <p class="label">上限料金 <span class="meta">いまの30分・${esc(meLabel())}</span></p>
    <div class="range-row"><input type="range" min="${lo}" max="${hi}" step="10" value="${filters.maxYen ?? hi}" aria-label="上限料金">
      <output>${filters.maxYen != null ? `${filters.maxYen.toLocaleString()}円以下` : '指定なし'}</output></div>
    ${filters.maxYen != null ? '<p class="meta">いま30分料金のない店舗（営業時間外など）は除外されます</p>' : ''}
    <div class="popover-foot"><span class="meta">${shown.length}店が該当</span><button class="reset">リセット</button></div>`;
}
filterBtn.onclick = () => {
  const p = popover('filter-panel', renderFilters, (e, p) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('reset')) { filters.brands.clear(); filters.machines.clear(); filters.maxYen = null; }
    const set = b.dataset.brand ? filters.brands : b.dataset.machine ? filters.machines : null;
    const v = b.dataset.brand ?? b.dataset.machine;
    if (set) set.has(v) ? set.delete(v) : set.add(v);
    refresh();
    p.innerHTML = renderFilters();
  });
  p?.addEventListener('input', e => {
    if (e.target.type !== 'range') return;
    filters.maxYen = +e.target.value >= +e.target.max ? null : +e.target.value; // far right = 指定なし
    refresh();
    p.querySelector('output').textContent = filters.maxYen != null ? `${filters.maxYen.toLocaleString()}円以下` : '指定なし';
    p.querySelector('.popover-foot .meta').textContent = `${shown.length}店が該当`;
  });
  p?.addEventListener('change', () => (p.innerHTML = renderFilters())); // redraw the exclusion note once the slider is let go
};

// ---- Shop card ----
function cardTable(shop, party) {
  const order = [me.customer, ...Object.keys(CUSTOMERS).filter(c => c !== me.customer)];
  const cls = (c, side) => (c === me.customer ? `me me-${side}` : '');
  const rows = slotTable(shop, party);
  const nowDay = r => (r.plan === '30min' ? whichDay(r, new Date(), holidays) : null); // only 30分: free time also depends on last entry
  const hasFallback = rows.some(r => [...Object.values(r.weekday), ...Object.values(r.other)].some(p => p.fallback));
  const now = currentPrice(shop, { party, customer: me.customer, holidays });
  return `<p class="now-line">${now
      ? `いま <b>${esc(now.entry.period)} 30分 ${now.day === 'weekday' ? '平日' : DAY[now.entry.otherDay]}</b>：<b class="now-price">${cell(now.row)}${now.row.yen != null ? '円' : ''}</b>`
      : 'いまの時間帯の30分料金は掲載されていません'}</p>
    <div class="table-scroll"><table class="prices">
    <thead>
      <tr><th rowspan="2" class="slot">時間帯</th>${order.map(c => `<th colspan="2" class="${c === me.customer ? 'me me-l me-r' : ''}">${CUSTOMERS[c]}</th>`).join('')}</tr>
      <tr>${order.map(c => `<th class="day ${cls(c, 'l')}">平日</th><th class="day ${cls(c, 'r')}">休日</th>`).join('')}</tr>
    </thead>
    <tbody>${rows.map(r => {
      const d = nowDay(r);
      return `<tr>
      <th class="slot"><b>${esc(r.plan === '30min' ? `${r.period} 30分` : r.name)}</b>${d ? ' <span class="now-badge">いま</span>' : ''}<br>${slotText(r.slot)}${r.otherDay && r.otherDay !== 'weekend_holiday' ? `<br><span class="meta">休日=${DAY[r.otherDay]}</span>` : ''}</th>
      ${order.map(c => `<td class="${cls(c, 'l')}${d === 'weekday' && c === me.customer ? ' now' : ''}">${cell(r.weekday[c])}</td><td class="${cls(c, 'r')}${d === 'other' && c === me.customer ? ' now' : ''}">${cell(r.other[c])}</td>`).join('')}
    </tr>`;
    }).join('')}</tbody></table></div>
    ${hasFallback ? `<p class="meta">${FALLBACK_NOTE}</p>` : ''}`;
}

function openCard(s, from = view?.type === 'compare' ? 'compare' : null) {
  view = { type: 'card', shop: s, from };
  const hasSolo = s.prices.some(p => p.party === 'solo');
  let party = hasSolo ? me.party : 'group';
  const w = walk(s);
  panel.innerHTML = `
    <div class="panel-head">${from ? '<button class="back">← 比較に戻る</button>' : ''}<button class="close" aria-label="閉じる">×</button></div>
    <p class="brand" style="--brand:${BRAND_COLORS[s.brand]}">${esc(BRAND_NAMES[s.brand] ?? s.brand)}</p>
    <h2>${esc(s.name)}</h2>
    <p><a class="official" href="${esc(s.source_url)}" target="_blank" rel="noopener">公式ページで店舗情報を見る ↗</a></p>
    <p class="meta">${s.hours === '24h' ? '24時間営業' : `営業 ${esc(s.hours)}`}${w ? ` · ${w}` : ''}</p>
    <ul class="chips">${s.machines.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
    <h3>料金（円・税込・ドリンク飲み放題）</h3>
    ${hasSolo ? `<div class="toggle" role="group" aria-label="人数">${Object.entries(PARTIES).map(([k, v]) => `<button data-party="${k}" aria-pressed="${party === k}">${v}</button>`).join('')}</div>` : ''}
    <div class="price-area">${cardTable(s, party)}</div>
    ${s.notes.length ? `<ul class="notes">${s.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <p class="meta source">料金は${esc(s.prices_as_of)}時点 · 最終確認 ${esc(s.fetched_at)}</p>`;
  panel.querySelectorAll('.toggle button').forEach(b => b.onclick = () => {
    party = b.dataset.party;
    panel.querySelectorAll('.toggle button').forEach(x => x.setAttribute('aria-pressed', x === b));
    panel.querySelector('.price-area').innerHTML = cardTable(s, party);
  });
  wirePanel();
  // Keep the tapped pin visible beside (desktop) or above (phone) the panel.
  const size = map.getSize(), pt = map.latLngToContainerPoint([s.lat, s.lng]);
  const target = innerWidth >= 768 ? L.point((size.x - panel.offsetWidth) / 2, size.y / 2) : L.point(size.x / 2, (size.y - panel.offsetHeight) / 2);
  const offset = pt.subtract(target);
  if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) quietly(() => map.panBy(offset));
}

// ---- Comparison ----
// Opens on today's day type: 休日・前日 on weekends and holidays.
const cmp = { plan: '30min', day: isDayType('weekend_holiday', jst(new Date()).ymd, holidays) ? 'other' : 'weekday' };
function openCompare() {
  view = { type: 'compare' };
  const list = shown.map(s => ({ s, w: walk(s), slots: slotTable(s, me.party).filter(r => r.plan === cmp.plan) }));
  if (userPos) list.sort((a, b) => userPos.distanceTo([a.s.lat, a.s.lng]) - userPos.distanceTo([b.s.lat, b.s.lng]));
  else list.sort((a, b) => a.s.name.localeCompare(b.s.name, 'ja'));

  // Columns = the site's slot names (period + name), ordered by time; the header shows the most common time.
  const cols = new Map();
  for (const { slots } of list) for (const r of slots) {
    const k = `${r.period}|${r.name}`;
    if (!cols.has(k)) cols.set(k, { key: k, period: r.period, name: r.name, plan: r.plan, times: {} });
    cols.get(k).times[r.slot] = (cols.get(k).times[r.slot] ?? 0) + 1;
  }
  const colList = [...cols.values()].map(c => ({ ...c, slot: Object.entries(c.times).sort((a, b) => b[1] - a[1])[0][0] })).sort(bySiteOrder);
  const label = c => (cmp.plan === '30min' ? c.period : cmp.plan === 'night_pack' ? c.name : c.name.replace('フリータイム', '') || c.name);
  const running = c => whichDay({ slot: c.slot }, new Date(), holidays) !== null;

  const pick = (slots, c) => {
    const r = slots.find(r => `${r.period}|${r.name}` === c.key);
    return r && { r, p: (cmp.day === 'weekday' ? r.weekday : r.other)[me.customer] };
  };
  const min = colList.map(c => Math.min(...list.map(({ slots }) => pick(slots, c)?.p?.yen ?? Infinity)));
  const anyFallback = list.some(({ slots }) => colList.some(c => pick(slots, c)?.p?.fallback));
  const filtered = shown.length < inArea.length;

  panel.innerHTML = `
    <div class="panel-head"><button class="close" aria-label="閉じる">×</button></div>
    <h2>料金比較</h2>
    <p class="meta">${shown.length}店${filtered ? `（絞り込み中・エリア内${inArea.length}店）` : ''} · <b>${esc(meLabel())}</b> の料金（円・税込）${userPos ? ' · 近い順' : ''}</p>
    <div class="toggle" role="group" aria-label="プラン">${Object.entries(PLAN_TABS).map(([k, v]) => `<button data-plan="${k}" aria-pressed="${cmp.plan === k}">${v}</button>`).join('')}</div>
    <div class="toggle" role="group" aria-label="曜日">${[['weekday', '平日'], ['other', '休日・前日']].map(([k, v]) => `<button data-day="${k}" aria-pressed="${cmp.day === k}">${v}</button>`).join('')}</div>
    ${colList.length ? `<div class="table-scroll"><table class="prices compare">
      <thead><tr><th class="slot">店舗</th>${colList.map(c => `<th>${esc(label(c))}${running(c) ? ' <span class="now-badge">いま</span>' : ''}<br><span class="meta">${slotText(c.slot)}</span></th>`).join('')}</tr></thead>
      <tbody>${list.map(({ s, w, slots }) => `<tr>
        <th class="slot"><button class="shop-link" data-id="${esc(s.id)}">${esc(s.name)}</button>${w ? `<br><span class="meta">${w}</span>` : ''}</th>
        ${colList.map((c, i) => {
          const hit = pick(slots, c);
          if (!hit?.p) return '<td></td>';
          const best = hit.p.yen != null && hit.p.yen === min[i] && list.length > 1;
          return `<td class="${best ? 'best' : ''}">${cell(hit.p)}${best ? '★' : ''}${hit.r.slot !== c.slot ? `<br><span class="meta">${slotText(hit.r.slot)}</span>` : ''}</td>`;
        }).join('')}
      </tr>`).join('')}</tbody></table></div>` : `<p class="meta">${shown.length ? 'このエリアにはこのプランの料金がありません。' : '条件に合う店舗がありません。'}</p>`}
    <ul class="notes">
      <li>★ 列の最安値</li>
      ${anyFallback ? `<li>${FALLBACK_NOTE}</li>` : ''}
      ${cmp.day === 'other' ? '<li>休日・前日は各店の表記（土日祝・金土日祝祝前など）による</li>' : ''}
      <li>空欄は店舗に記載なし。地図を動かして「このエリアで検索」で対象店舗を変更</li>
    </ul>`;
  panel.querySelectorAll('[data-plan],[data-day]').forEach(b => b.onclick = () => {
    Object.assign(cmp, b.dataset.plan ? { plan: b.dataset.plan } : { day: b.dataset.day });
    openCompare();
  });
  panel.querySelectorAll('.shop-link').forEach(b => b.onclick = () => openCard(shops.find(s => s.id === b.dataset.id), 'compare'));
  wirePanel();
}
compareBtn.onclick = openCompare;

// ---- Panel plumbing ----
function wirePanel() {
  panel.querySelector('.close').onclick = closePanel;
  const back = panel.querySelector('.back');
  if (back) back.onclick = openCompare;
  panel.hidden = false;
  panel.scrollTop = 0;
  document.body.classList.add('panel-open');
}
function closePanel() {
  view = null;
  panel.hidden = true;
  document.body.classList.remove('panel-open');
}
map.on('click', () => { closePanel(); document.querySelectorAll('.popover').forEach(p => p.remove()); });
document.addEventListener('keydown', e => e.key === 'Escape' && (closePanel(), document.querySelectorAll('.popover').forEach(p => p.remove())));
