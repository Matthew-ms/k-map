import { slotTable, currentPrice, whichDay, jst, estimate, slotName, nameNote, lastEntry, CUSTOMER_SUBS, rankNow, daySet } from './price.js';
import { t, LANGS, LANG_SHORT, getLang, setLang, trWords, dayText, dateText, yenText, walkText } from './i18n.js';

const BRAND_COLORS = { jankara: '#e60012', bigecho: '#2563eb', manekineko: '#f59e0b', karaokekan: '#16a34a' };
const BRAND_MARKS = { jankara: 'ジ', bigecho: 'BE', manekineko: 'ま', karaokekan: '館' }; // pin badges
const BRAND_NAMES = { jankara: 'ジャンカラ', bigecho: 'ビッグエコー', manekineko: 'まねきねこ', karaokekan: 'カラオケ館' };
const CUSTOMER_KEYS = ['student_member', 'student', 'member', 'senior', 'general'];
const CUSTOMER_JA = { student_member: '学生会員', student: '学生', member: '会員', senior: 'シニア', general: '一般' };
const DAY_JA = { weekend_holiday: '土日祝', sun_holiday: '日祝', fri_sun_hol_eve: '金土日祝祝前', fri_sat_hol_eve: '金土祝前' };
const HALF_MS = 30 * 60e3;

// ---- Words in the current language ----
const custName = c => t(CUSTOMER_JA[c]);
const custLabel = (shop, c) => (shop.brand === 'bigecho' && c === 'student' ? t('学割') : custName(c)); // a chain's own word
const brandName = b => t(BRAND_NAMES[b] ?? b);
// Day label of a slot's special column: the chain's own words in Japanese, written from the day set elsewhere.
const otherLabel = c => (getLang() === 'ja' ? DAY_JA[c.day] ?? c.label : null) ?? dayText(daySet(c.day)); // c: a slot's otherCols item
const dayName = (e, key) => (key === 'weekday' ? t('平日') : otherLabel(e.otherCols.find(c => c.key === key))); // the column that applies
const sName = e => trWords(slotName(e));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const slotText = s => s.replace(/(^|-)0/g, '$1').replace('-', '–');
const hm = d => { const m = jst(d).min; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
const hoursText = h => (h === '24h' ? t('24時間営業') : h ?? '');
const storage = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// A price with its marks: ＊ 2名以上 price shown for 1名, † closest customer type, +1D drink ordered separately.
const cell = (r, unit = false) => !r ? '' : r.yen == null ? esc(r.text)
  : `${unit ? yenText(r.yen) : r.yen.toLocaleString()}${r.fallback ? '＊' : ''}${r.substitute ? '†' : ''}${r.drinks_included === false ? '<span class="d1">+1D</span>' : ''}`;
const marksOf = rows => ({ fallback: rows.some(r => r?.fallback), substitute: new Set(rows.map(r => r?.substitute).filter(Boolean)), drink: rows.some(r => r && r.drinks_included === false) });
const markNotes = m => [
  m.fallback && t('＊1名料金の記載なし・2名以上の料金を表示'),
  m.substitute.size && t('†{me}の料金がない店舗は、{used}の料金を表示', { me: custName(me.customer), used: [...m.substitute].map(custName).join('・') }),
  m.drink && t('+1D：ドリンク1杯の注文が別途必要（1ドリンクオーダー制）'),
].filter(Boolean).map(n => `<li>${n}</li>`).join('');
const hasPrices = s => s.prices.length > 0;
const badge = (s, small) => `<span class="badge${small ? ' sm' : ''}" style="--c:${BRAND_COLORS[s.brand] ?? '#666'}" aria-hidden="true">${BRAND_MARKS[s.brand] ?? '?'}</span>`;
const officialLink = s => `<a class="official-btn" href="${esc(s.price_url ?? s.source_url)}" target="_blank" rel="noopener">${t('公式サイトで料金を見る')} ↗</a>`;
const shopLink = s => `<a class="shop-page" href="${esc(s.source_url)}" target="_blank" rel="noopener">${t('店舗ページを開く')} ↗</a>`;
// Live availability isn't public: link to the chain's own booking (or the shop's phone), and to Google Maps
// (reviews, photos, directions; its "popular times" chart was missing for the shops checked on 2026-10-27).
const bookLink = s => (s.booking_url ? `<a class="shop-page" href="${esc(s.booking_url)}" target="_blank" rel="noopener">${t('空き状況・予約')} ↗</a>`
  : s.tel ? `<a class="shop-page" href="tel:${esc(s.tel)}">${t('電話で空き確認')} ☎</a>` : '');
const mapsLink = s => {
  const name = s.name.includes(BRAND_NAMES[s.brand]) ? s.name : `${BRAND_NAMES[s.brand]} ${s.name}`;
  // Street address only: the building and floor ("…ビル3〜4階") make Google show a list instead of the shop.
  const q = encodeURIComponent(`${name} ${s.address?.split(/\s+/)[0] ?? `${s.lat},${s.lng}`}`);
  return `<a class="shop-page sub" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">${t('Googleマップ')} ↗</a>`;
};
// Hand-entered prices: say where they came from and when, and warn once they're old.
const manualNote = s => {
  const days = Math.floor((Date.now() - Date.parse(s.manual.checked_on)) / 864e5);
  return `<p class="meta source">${t('公式の料金表から手入力 · {date}確認', { date: esc(s.manual.checked_on) })} · <a href="${esc(s.manual.source)}" target="_blank" rel="noopener">${t('料金表を開く')} ↗</a></p>${days > 90 ? `<p class="warn">${t('確認から{days}日経っています。最新の料金は公式の料金表でご確認ください。', { days })}</p>` : ''}`;
};

// ---- My identity: how many people and which price type (saved on this device) ----
const ID_KEY = 'kmap.identity';
const me = { count: 1, customer: 'student_member' };
{
  const saved = storage.get(ID_KEY) ?? {};
  if (saved.party && !saved.count) saved.count = saved.party === 'group' ? 2 : 1; // older saved format
  if (saved.count >= 1) me.count = saved.count;
  if (CUSTOMER_JA[saved.customer]) me.customer = saved.customer;
}
const party = () => (me.count > 1 ? 'group' : 'solo'); // 1 person pays 1名 prices
const saveMe = () => storage.set(ID_KEY, me);
const meLabel = () => t('{n}名・{type}', { n: me.count, type: custName(me.customer) });

// ---- My plan: when, how long, which shop (saved on this device) ----
const PLAN_KEY = 'kmap.plan';
const pad = n => String(n).padStart(2, '0');
const nowParts = (d = new Date()) => { const j = jst(d); return { date: j.ymd, start: `${pad(Math.floor(j.min / 60))}:${pad(j.min % 60)}` }; };
const plan = { date: null, start: null, mode: 'time', blocks: 4, freeKey: null, shopId: null, ...storage.get(PLAN_KEY) };
if (!plan.date || plan.date < jst(new Date()).ymd) Object.assign(plan, nowParts(new Date(Math.ceil((Date.now() + 1) / HALF_MS) * HALF_MS))); // next half hour
const savePlan = () => storage.set(PLAN_KEY, plan);
const planStart = () => new Date(`${plan.date}T${plan.start}:00+09:00`);
const durationLabel = b => (b === 1 ? t('30分') : t('{h}時間', { h: b / 2 }));
const planSummary = () => {
  const s = planStart();
  return plan.mode === 'free'
    ? t('{date} {start}〜 フリータイム', { date: dateText(plan.date), start: hm(s) })
    : t('{date} {start}〜{end}（{dur}）', { date: dateText(plan.date), start: hm(s), end: hm(new Date(s.getTime() + plan.blocks * HALF_MS)), dur: durationLabel(plan.blocks) });
};

// ---- Map (inside the frame between the header and the footer) ----
const map = L.map('map');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const [shops, holidays] = await Promise.all(['data/shops.json', 'data/holidays.json'].map(u => fetch(u).then(r => r.json())));
const byId = id => shops.find(s => s.id === id);
const $ = id => document.getElementById(id);
const panel = $('panel'), compareBtn = $('compare-btn'), areaBtn = $('area-btn'), meBtn = $('me-btn'),
  filterBtn = $('filter-btn'), langBtn = $('lang-btn'), planCard = $('plan-card'), toast = $('toast');

// Badge pins: the chain's mark on its colour inside a white ring. The planned shop's pin is bigger.
const pinIcon = (s, big) => L.divIcon({ className: 'pin-wrap', iconSize: big ? [40, 40] : [30, 30],
  html: `<span class="pin${big ? ' big' : ''}" style="--c:${BRAND_COLORS[s.brand] ?? '#666'}">${BRAND_MARKS[s.brand] ?? '?'}</span>` });
for (const s of shops) s.pin = L.marker([s.lat, s.lng], { icon: pinIcon(s, false), title: s.name, keyboard: false }).on('click', () => openCard(s));
let bigPin = null;
function markPlannedPin() {
  const s = plan.shopId && byId(plan.shopId);
  if (bigPin && bigPin !== s) bigPin.pin.setIcon(pinIcon(bigPin, false)).setZIndexOffset(0);
  if (s) s.pin.setIcon(pinIcon(s, true)).setZIndexOffset(1000);
  bigPin = s || null;
}

// 30分 price for my identity at this moment (null when no 30分 slot is running, e.g. closed)
const nowPrice = s => currentPrice(s, { party: party(), customer: me.customer, holidays });
const estimateFor = s => estimate(s, { party: party(), customer: me.customer, start: planStart(), mode: plan.mode, blocks: plan.blocks, freeKey: plan.freeKey, holidays });

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
let area, inArea = [], shown = [], userPos = null, view = null, quietUntil = 0;
function refresh() {
  shown = inArea.filter(passes);
  for (const s of shops) shown.includes(s) ? s.pin.addTo(map) : s.pin.remove();
  markPlannedPin();
  renderChrome();
  if (view?.type === 'compare') openCompare();
}
// Header and footer texts (also redrawn when the language changes)
function renderChrome() {
  compareBtn.textContent = t('料金比較 {n}店', { n: shown.length });
  compareBtn.disabled = !shown.length;
  const active = filters.brands.size + filters.machines.size + (filters.maxYen != null);
  filterBtn.textContent = active ? t('絞り込み（{n}）', { n: active }) : t('絞り込み');
  filterBtn.classList.toggle('on', !!active);
  meBtn.textContent = meLabel();
  meBtn.setAttribute('aria-label', t('人数と区分を変更'));
  langBtn.textContent = LANG_SHORT[getLang()];
  langBtn.setAttribute('aria-label', t('言語'));
  areaBtn.textContent = t('このエリアで検索');
  renderPlanBar();
}
function searchArea() {
  area = map.getBounds();
  inArea = shops.filter(s => area.contains([s.lat, s.lng]));
  areaBtn.hidden = true;
  setRef();
  storage.set(VIEW_KEY, { center: map.getCenter(), zoom: map.getZoom() });
  refresh();
}
// "Search this area" appears only when the user really changed the view: zoomed, or moved the centre by
// more than 10% of the screen. Programmatic moves reset the reference; a resize (e.g. a phone's address
// bar sliding away) keeps the centre and zoom, so it doesn't count.
let ref;
const setRef = () => (ref = { center: map.getCenter(), zoom: map.getZoom() });
// A time window, not a counter: an interrupted or zero-length pan never fires moveend, which would leave a counter stuck.
const quietly = fn => { quietUntil = Date.now() + 700; fn(); };
map.on('moveend', () => {
  if (Date.now() < quietUntil) { setRef(); return; }
  if (!ref) return;
  const size = map.getSize();
  const shift = map.latLngToContainerPoint(ref.center).distanceTo(size.divideBy(2));
  if (map.getZoom() !== ref.zoom || shift > Math.min(size.x, size.y) * 0.1) areaBtn.hidden = false;
});
// Open where the user last searched; first visit: Namba/Shinsaibashi.
const VIEW_KEY = 'kmap.view';
const lastView = storage.get(VIEW_KEY);
map.invalidateSize(); // the frame's size is known only after layout
quietly(() => map.setView(lastView?.center ?? [34.6695, 135.5015], lastView?.zoom ?? 15));
searchArea();
areaBtn.onclick = searchArea;
setInterval(refresh, 60_000); // "now" prices move with the clock

// ---- Current location → walking time ----
let userDot;
const LocateControl = L.Control.extend({
  onAdd() {
    const b = L.DomUtil.create('button', 'locate-btn');
    b.type = 'button';
    b.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="currentColor"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3" stroke="currentColor" stroke-width="2"/></svg>';
    L.DomEvent.disableClickPropagation(b);
    b.onclick = locate;
    return b;
  },
});
new LocateControl({ position: 'topleft' }).addTo(map);
const labelLocate = () => document.querySelectorAll('.locate-btn').forEach(b => { b.title = t('現在地'); b.setAttribute('aria-label', t('現在地')); });

function locate() {
  if (!navigator.geolocation) return showToast(t('この端末では位置情報を使えません'));
  navigator.geolocation.getCurrentPosition(pos => {
    userPos = L.latLng(pos.coords.latitude, pos.coords.longitude);
    userDot ??= L.circleMarker(userPos, { radius: 8, color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1, interactive: false }).addTo(map);
    userDot.setLatLng(userPos);
    map.setView(userPos, Math.max(map.getZoom(), 16));
    rerender();
  }, () => showToast(t('位置情報を取得できませんでした。ブラウザの設定で位置情報を許可してください。')), { enableHighAccuracy: true, timeout: 10000 });
}

// Straight-line distance × 1.25 for streets, at 80 m per minute (the usual Japanese walking-time standard).
const walkMeters = s => (userPos ? userPos.distanceTo([s.lat, s.lng]) * 1.25 : null);
const walk = s => { const m = walkMeters(s); return m == null ? null : walkText(m); };

function showToast(msg) {
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => (toast.hidden = true), 4000);
}

const rerender = () => {
  if (view?.type === 'card') openCard(view.shop, view.from);
  else if (view?.type === 'compare') openCompare();
  else if (view?.type === 'plan') openPlan();
};

// ---- Small popovers under the header buttons ----
function popover(id, render, onClick) {
  const open = $(id);
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

// Identity: 人数 stepper + 区分. Shared by the popover and the plan editor.
const countStepper = () => `<div class="stepper"><button data-count="-1" aria-label="${t('1人減らす')}" ${me.count <= 1 ? 'disabled' : ''}>−</button><b>${t('{n}名', { n: me.count })}</b><button data-count="1" aria-label="${t('1人増やす')}" ${me.count >= 20 ? 'disabled' : ''}>＋</button></div>`;
const customerChips = () => `<div class="chips-toggle">${CUSTOMER_KEYS.map(k => `<button data-customer="${k}" aria-pressed="${me.customer === k}">${custName(k)}</button>`).join('')}</div>`;
function applyIdentity(b) {
  if (b.dataset.count) me.count = Math.min(20, Math.max(1, me.count + +b.dataset.count));
  else if (b.dataset.customer) me.customer = b.dataset.customer;
  else return false;
  saveMe();
  refresh(); // the max-price filter and the plan total depend on who is going
  return true;
}
const renderMePanel = () => `<p class="label">${t('人数')}</p>${countStepper()}<p class="meta">${t('1名は1名料金、2名以上はグループ料金で計算')}</p>
  <p class="label">${t('区分')}</p>${customerChips()}<p class="meta">${t('この端末に保存されます')}</p>`;
meBtn.onclick = () => popover('me-panel', renderMePanel, (e, p) => {
  const b = e.target.closest('button');
  if (b && applyIdentity(b)) { p.innerHTML = renderMePanel(); rerender(); }
});

// Language
langBtn.onclick = () => popover('lang-panel', () => `<p class="label">${t('言語')}</p><div class="lang-list">${Object.entries(LANGS).map(([k, v]) =>
  `<button data-lang="${k}" aria-pressed="${getLang() === k}">${v}</button>`).join('')}</div>`, (e, p) => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  setLang(b.dataset.lang);
  p.remove();
  labelLocate();
  renderChrome();
  rerender();
});

// Filter panel
const brands = [...new Set(shops.map(s => s.brand))];
const machines = [...new Set(shops.flatMap(s => s.machines))].sort();
const families = [...new Set(machines.map(family))].filter(f => !machines.includes(f));
function renderFilters() {
  const prices = shops.map(s => nowPrice(s)?.row.yen).filter(y => y != null);
  const lo = Math.floor(Math.min(...prices, 100) / 10) * 10, hi = Math.ceil(Math.max(...prices, 1000) / 10) * 10;
  const chip = (kind, value, label, on, pre = '') => `<button data-${kind}="${esc(value)}" aria-pressed="${on}">${pre}${esc(label)}</button>`;
  return `
    <p class="label">${t('ブランド')}</p><div class="chips-toggle">${brands.map(b => chip('brand', b, brandName(b), filters.brands.has(b), badge({ brand: b }, true))).join('')}</div>
    <p class="label">${t('機種')}</p><div class="chips-toggle">
      ${families.map(f => chip('machine', f, t('{f}系すべて', { f }), filters.machines.has(f))).join('')}
      ${machines.map(m => chip('machine', m, m, filters.machines.has(m))).join('')}</div>
    <p class="label">${t('上限料金')} <span class="meta">${t('いまの30分・{me}', { me: esc(meLabel()) })}</span></p>
    <div class="range-row"><input type="range" min="${lo}" max="${hi}" step="10" value="${filters.maxYen ?? hi}" aria-label="${t('上限料金')}">
      <output>${filters.maxYen != null ? t('{yen}以下', { yen: yenText(filters.maxYen) }) : t('指定なし')}</output></div>
    ${filters.maxYen != null ? `<p class="meta">${t('いま30分料金のない店舗（営業時間外など）は除外されます')}</p>` : ''}
    <div class="popover-foot"><span class="meta">${t('{n}店が該当', { n: shown.length })}</span><button class="reset">${t('リセット')}</button></div>`;
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
    p.querySelector('output').textContent = filters.maxYen != null ? t('{yen}以下', { yen: yenText(filters.maxYen) }) : t('指定なし');
    p.querySelector('.popover-foot .meta').textContent = t('{n}店が該当', { n: shown.length });
  });
  p?.addEventListener('change', () => (p.innerHTML = renderFilters())); // redraw the exclusion note once the slider is let go
};

// ---- Plan: the footer card is always there; tap it to edit ----
// Total for the chosen plan at a shop: { e, total } — total is null when some part has no listed price.
function planTotal(s) {
  const e = estimateFor(s);
  return { e, total: e.perPerson != null ? e.perPerson * me.count : null };
}
function renderPlanBar() {
  const s = plan.shopId && byId(plan.shopId);
  const total = s && hasPrices(s) ? planTotal(s).total : null;
  planCard.innerHTML = `
    <span class="pc-main"><b>${s ? `${badge(s, true)}${esc(s.name)}` : `${t('プラン')} <span class="meta">${t('店舗を選ぶと金額を表示')}</span>`}</b><span class="meta">${esc(planSummary())} · ${esc(meLabel())}</span></span>
    <span class="pc-total">${s ? (total != null ? t('約{yen}', { yen: yenText(total) }) : t('料金を確認')) : '<span class="pc-chev">›</span>'}</span>
    ${s ? `<button class="pc-clear" aria-label="${t('店舗の選択を解除')}">×</button>` : ''}`;
  planCard.setAttribute('aria-label', t('プランを開く'));
}
planCard.onclick = e => {
  if (e.target.closest('.pc-clear')) { plan.shopId = null; savePlan(); refresh(); rerender(); return; }
  view?.type === 'plan' ? closePanel() : openPlan();
};
planCard.onkeydown = e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openPlan());

function planResult(s) {
  if (!hasPrices(s)) return `<div class="plan-total"><p class="warn">${t('この店舗の料金はアプリに掲載していません（公式サイトの料金表が画像・PDFのため）。')}</p>${officialLink(s)}</div>`;
  const { e, total } = planTotal(s);
  const per = e.perPerson;
  const lines = [];
  const used = e.mode === 'time' ? e.segs.map(g => g.cp?.row) : [e.pick?.row];
  if (e.mode === 'time') {
    for (const g of e.segs) {
      lines.push(g.cp
        ? `${hm(g.from)}–${hm(g.to)} ${esc(sName(g.cp.entry))} ${esc(dayName(g.cp.entry, g.cp.day))}：${cell(g.cp.row, true)} × ${g.count}`
        : `${hm(g.from)}–${hm(g.to)}：${t('料金の掲載なし（営業時間外の可能性）')}`);
    }
  } else if (e.pick) {
    lines.push(`${esc(sName(e.pick.entry))} ${slotText(e.pick.entry.slot)}：${cell(e.pick.row, true)}`);
  }
  const hint = e.mode === 'time' && e.cheaperFree
    ? `<div class="hint">${t('{name}（〜{end}）なら1人{yen}で、こちらの方が安くなります。', { name: esc(sName(e.cheaperFree.entry)), end: slotText(e.cheaperFree.entry.slot).split('–')[1], yen: yenText(e.cheaperFree.row.yen) })}
        <button class="use-free" data-free="${esc(e.cheaperFree.key)}">${t('フリータイムにする')}</button></div>` : '';
  return `<div class="plan-total">
      <p class="meta">${t('合計の目安（{me}）', { me: esc(meLabel()) })}</p>
      <p class="total">${total != null ? t('約{yen}', { yen: yenText(total) }) : t('計算できません')}</p>
      ${per != null ? `<p class="meta">${t('1人 {yen} × {n}名', { yen: yenText(per), n: me.count })}</p>` : ''}
      ${e.mode === 'time' && e.missing ? `<p class="warn">${t('一部の時間帯に料金の掲載がありません。掲載分のみ：1人 {yen}', { yen: yenText(e.partial) })}</p>` : ''}
      ${e.mode === 'free' && !e.pick ? `<p class="warn">${e.options.length ? t('この開始時刻から使えるフリータイムがありません（最終受付を過ぎています）。') : t('この開始時刻から使えるフリータイムがありません。')}</p>` : ''}
      ${lines.length ? `<ul class="breakdown">${lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}
      ${hint}
    </div>
    <ul class="notes">
      <li>${t('目安です。部屋の追加料金・有料ドリンクコース・時間帯をまたぐ際の扱いなどで実際の金額は変わります。')}</li>
      ${markNotes(marksOf(used))}
      <li>${t('全員が「{type}」として計算。料金は{date}時点', { type: custName(me.customer), date: esc(s.prices_as_of) })}</li>
    </ul>`;
}

function openPlan() {
  view = { type: 'plan' };
  const s = plan.shopId && byId(plan.shopId);
  const e = s && hasPrices(s) && plan.mode === 'free' ? estimateFor(s) : null;
  panel.innerHTML = `
    <div class="panel-head"><button class="close" aria-label="${t('閉じる')}">×</button></div>
    <h2>${t('プラン')}</h2>
    <div class="plan-shop">${s
      ? `<p class="meta">${t('行く店舗')}</p>${badge(s, true)}<button class="shop-link" data-id="${esc(s.id)}">${esc(s.name)}</button>${walk(s) ? ` <span class="meta">${walk(s)}</span>` : ''}`
      : `<p class="warn">${t('店舗が未選択です。地図のピンから店舗を開き「この店にする」を押してください。')}</p>`}</div>
    <div class="field-row">
      <label>${t('日付')}<input type="date" id="plan-date" value="${plan.date}" min="${jst(new Date()).ymd}"></label>
      <label>${t('開始')}<input type="time" id="plan-start" value="${plan.start}"></label>
      <button class="now-btn" data-now>${t('今')}</button>
    </div>
    <div class="toggle" role="group" aria-label="${t('利用方法')}">${[['time', t('時間で指定')], ['free', t('フリータイム')]].map(([k, v]) => `<button data-mode="${k}" aria-pressed="${plan.mode === k}">${v}</button>`).join('')}</div>
    ${plan.mode === 'time' ? `
      <div class="stepper"><button data-blocks="-1" aria-label="${t('30分減らす')}" ${plan.blocks <= 1 ? 'disabled' : ''}>−</button><b>${durationLabel(plan.blocks)}</b><button data-blocks="1" aria-label="${t('30分増やす')}" ${plan.blocks >= 24 ? 'disabled' : ''}>＋</button></div>
      <div class="chips-toggle">${[1, 2, 3, 4, 6].map(b => `<button data-set-blocks="${b}" aria-pressed="${plan.blocks === b}">${durationLabel(b)}</button>`).join('')}</div>`
    : e ? (e.options.length ? `<div class="free-options">${e.options.map(o => `
        <button data-free="${esc(o.key)}" aria-pressed="${e.pick?.key === o.key}" ${o.late ? 'class="late" disabled' : ''}>
          <span><b>${esc(sName(o.entry))}</b> ${slotText(o.entry.slot)}<br><span class="meta">${o.last ? t('最終受付 {time}', { time: slotText(o.last) }) : ''}${o.late ? ` · ${t('受付終了')}` : ''}${o.row.slot_note ? ` · ${esc(o.row.slot_note)}` : ''}</span></span>
          <span class="fo-price">${cell(o.row, true)}<span class="meta">${t('/人')}</span></span>
        </button>`).join('')}</div>` : `<p class="warn">${t('この開始時刻に使えるフリータイムの掲載がありません。')}</p>`)
    : `<p class="meta">${t('店舗を選ぶと、使えるフリータイムが表示されます。')}</p>`}
    <p class="label">${t('人数・区分')}</p>${countStepper()}${customerChips()}
    ${s ? planResult(s) : ''}`;
  panel.querySelector('#plan-date').onchange = ev => { if (ev.target.value) { plan.date = ev.target.value; planChanged(); } };
  panel.querySelector('#plan-start').onchange = ev => { if (ev.target.value) { plan.start = ev.target.value; planChanged(); } };
  panel.querySelector('.shop-link')?.addEventListener('click', () => openCard(s));
  panel.onclick = ev => {
    const b = ev.target.closest('button');
    if (!b || b.classList.contains('close') || b.classList.contains('shop-link')) return;
    if (applyIdentity(b)) return openPlan();
    if (b.dataset.now !== undefined) Object.assign(plan, nowParts()); // 今: today, this minute
    else if (b.dataset.mode) plan.mode = b.dataset.mode;
    else if (b.dataset.blocks) plan.blocks = Math.min(24, Math.max(1, plan.blocks + +b.dataset.blocks));
    else if (b.dataset.setBlocks) plan.blocks = +b.dataset.setBlocks;
    else if (b.dataset.free) Object.assign(plan, { mode: 'free', freeKey: b.dataset.free });
    else return;
    planChanged();
  };
  wirePanel();
}
function planChanged() {
  savePlan();
  renderPlanBar();
  openPlan();
}

// ---- Shop card: prices first ----
// The customer column to show: mine, else the closest type this shop has.
function myColumn(shop) {
  const present = CUSTOMER_KEYS.filter(c => shop.prices.some(x => x.customer === c));
  return { present, mine: present.includes(me.customer) ? me.customer : (CUSTOMER_SUBS[me.customer] ?? []).find(c => present.includes(c)) ?? null };
}
// Slot cell: name, いま when it can be used now, time window and last entry (最終受付).
// Columns whose last entry differs are named: "受付〜15:00（平日）・14:00（休日）".
function slotHead(r, d) {
  // A 土日祝 exception (last_entry_alt) for the very days of a holiday column is that column's time; others stay extra.
  const cols = [{ key: 'weekday', day: null, label: t('平日') }, ...r.otherCols.map(c => ({ ...c, label: r.otherCols.length > 1 ? otherLabel(c) : t('休日') }))];
  const time = new Map(), extra = new Map();
  for (const c of cols) {
    const row = Object.values(r[c.key]).find(x => x.last_entry);
    if (!time.has(c.label)) time.set(c.label, row?.last_entry ?? null);
    const alt = row?.last_entry_alt;
    if (!alt) continue;
    const same = cols.find(x => x.day === alt.day);
    if (same) time.set(same.label, alt.time); else extra.set(otherLabel({ day: alt.day, label: null }), alt.time);
  }
  const lasts = [...time, ...extra].filter(([, x]) => x);
  const last = !lasts.length ? null : lasts.length === time.size && new Set(lasts.map(([, x]) => x)).size === 1 ? slotText(lasts[0][1])
    : lasts.map(([label, x]) => `${slotText(x)}（${label}）`).join('・');
  return `<th class="slot"><b>${esc(sName(r))}</b>${d ? ` <span class="now-badge">${t('いま')}</span>` : ''}<br><span class="meta">${slotText(r.slot)}${last ? ` · ${t('受付〜{time}', { time: last })}` : ''}</span></th>`;
}
// Holiday columns, said once above the table: "休日＝土・日・祝（夜 30分は金・土・日・祝・祝前日）".
function holidayLine(rows) {
  const groups = new Map();
  for (const r of rows) for (const c of r.otherCols) { const l = otherLabel(c); groups.set(l, [...(groups.get(l) ?? []), r]); }
  if (!groups.size) return '';
  const names = rows.map(r => sName(r));
  const plan = r => (names.filter(n => n === sName(r)).length > 1 ? `${sName(r)} ${slotText(r.slot).split('–')[0]}〜` : sName(r)); // same name twice: add the start
  const [main, ...rest] = [...groups].sort((a, b) => b[1].length - a[1].length);
  // Day labels contain commas in English, so plans are joined with " / " and groups with "; " there.
  const p = getLang() === 'en' ? { plans: ' / ', groups: '; ', eq: ' = ', open: ' (', close: ')' } : { plans: '・', groups: '、', eq: '＝', open: '（', close: '）' };
  const more = rest.map(([l, rs]) => t('{plans}は{days}', { plans: [...new Set(rs.map(plan))].join(p.plans), days: l }));
  return `<p class="meta day-legend">${t('休日')}${p.eq}${esc(main[0])}${more.length ? `${p.open}${esc(more.join(p.groups))}${p.close}` : ''}</p>`;
}
// Compact table for my type (平日 / 休日 per slot), or the full table for every type.
// A slot with a third day column (月～木 / 金・祝前 / 土日祝) gets an extra line for it.
function cardTable(shop, p, full) {
  const { present, mine } = myColumn(shop);
  const rows = slotTable(shop, p);
  const at = new Date();
  // いま: the column usable right now — 30分 while the slot runs, free time and packs until their last entry.
  const nowKey = r => {
    const k = whichDay(r, at, holidays);
    const row = k && ((mine && r[k][mine]) || Object.values(r[k]).find(x => x.yen != null));
    if (row?.yen == null) return null;
    return r.plan === '30min' || !lastEntry(r, row, at, holidays).late ? k : null;
  };
  const now = currentPrice(shop, { party: p, customer: me.customer, now: at, holidays });
  const nowLine = `<p class="now-line">${now
    ? `${t('いま')} <b>${esc(sName(now.entry))} ${esc(dayName(now.entry, now.day))}</b>：<b class="now-price">${cell(now.row, true)}</b>`
    : t('いまの時間帯の30分料金は掲載されていません')}</p>`;
  const extra = r => r.otherCols.slice(1);
  if (!full && mine) {
    const shown = rows.filter(r => r.weekday[mine] || r.otherCols.some(c => r[c.key][mine])); // slots not sold to my type: full table only
    const marks = marksOf(shown.flatMap(r => [r.weekday[mine], ...r.otherCols.map(c => r[c.key][mine])]));
    if (mine !== me.customer) marks.substitute.add(mine);
    return `${nowLine}${holidayLine(shown)}<div class="table-scroll"><table class="prices mine">
      <thead><tr><th class="slot">${esc(custLabel(shop, mine))}${mine !== me.customer ? '†' : ''}</th><th>${t('平日')}</th><th>${t('休日')}</th></tr></thead>
      <tbody>${shown.map(r => { const d = nowKey(r); return `<tr>${slotHead(r, d)}
        <td class="${d === 'weekday' ? 'now' : ''}">${cell(r.weekday[mine])}</td><td class="${d === 'other' ? 'now' : ''}">${cell(r.other[mine])}</td></tr>
        ${extra(r).map(c => `<tr class="sub"><th class="slot"><span class="meta">${esc(otherLabel(c))}</span></th><td></td><td class="${d === c.key ? 'now' : ''}">${cell(r[c.key][mine])}</td></tr>`).join('')}`; }).join('')}</tbody></table></div>
      <ul class="notes">${markNotes(marks)}</ul>`;
  }
  const order = mine ? [mine, ...present.filter(c => c !== mine)] : present;
  const cls = (c, side) => (c === mine ? `me me-${side}` : '');
  const marks = marksOf(rows.flatMap(r => [...Object.values(r.weekday), ...r.otherCols.flatMap(c => Object.values(r[c.key]))]));
  if (mine && mine !== me.customer) marks.substitute.add(mine);
  return `${nowLine}${holidayLine(rows)}<div class="table-scroll"><table class="prices">
    <thead>
      <tr><th rowspan="2" class="slot">${t('時間帯')}</th>${order.map(c => `<th colspan="2" class="${c === mine ? 'me me-l me-r' : ''}">${esc(custLabel(shop, c))}${c === mine && mine !== me.customer ? '†' : ''}</th>`).join('')}</tr>
      <tr>${order.map(c => `<th class="day ${cls(c, 'l')}">${t('平日')}</th><th class="day ${cls(c, 'r')}">${t('休日')}</th>`).join('')}</tr>
    </thead>
    <tbody>${rows.map(r => { const d = nowKey(r); return `<tr>${slotHead(r, d)}
      ${order.map(c => `<td class="${cls(c, 'l')}${d === 'weekday' && c === mine ? ' now' : ''}">${cell(r.weekday[c])}</td><td class="${cls(c, 'r')}${d === 'other' && c === mine ? ' now' : ''}">${cell(r.other[c])}</td>`).join('')}
    </tr>${extra(r).map(col => `<tr class="sub"><th class="slot"><span class="meta">${esc(otherLabel(col))}</span></th>
      ${order.map(c => `<td class="${cls(c, 'l')}"></td><td class="${cls(c, 'r')}${d === col.key && c === mine ? ' now' : ''}">${cell(r[col.key][c])}</td>`).join('')}</tr>`).join('')}`; }).join('')}</tbody></table></div>
    <ul class="notes">${markNotes(marks)}</ul>`;
}

function openCard(s, from = view?.type === 'compare' ? 'compare' : null) {
  view = { type: 'card', shop: s, from };
  const hasSolo = s.prices.some(p => p.party === 'solo');
  let p = hasSolo ? party() : 'group', full = false;
  const w = walk(s);
  const chosen = plan.shopId === s.id;
  const slotNotes = [...new Set(s.prices.filter(x => x.slot_note).map(x => `${sName(x)}：${x.slot_note}`))];
  // Where the short plan name dropped real information, the site's own heading.
  const headings = [...new Set(s.prices.map(x => nameNote(x) && `${sName(x)}（${slotText(x.slot)}）：${t('公式の表記')}「${x.name}」`).filter(Boolean))];
  const notes = [...s.notes, ...slotNotes, ...headings];
  panel.innerHTML = `
    <div class="panel-head">${from ? `<button class="back">← ${t('比較に戻る')}</button>` : ''}<button class="close" aria-label="${t('閉じる')}">×</button></div>
    <div class="card-head">
      <div class="ch-main">
        <p class="brand">${badge(s, true)}${esc(brandName(s.brand))}</p>
        <h2>${esc(s.name)}</h2>
        <p class="meta">${esc(hoursText(s.hours))}${w ? ` · ${w}` : ''}</p>
      </div>
      <div class="ch-side">
        <button class="choose" aria-pressed="${chosen}">${chosen ? `✓ ${t('選択中')}` : t('この店にする')}</button>
        ${hasSolo ? `<div class="toggle party-toggle" role="group" aria-label="${t('料金表の人数')}">${[['solo', t('1名')], ['group', t('2名以上')]].map(([k, v]) => `<button data-party="${k}" aria-pressed="${p === k}">${v}</button>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="card-links">${shopLink(s)}${bookLink(s)}${mapsLink(s)}</div>
    ${!hasPrices(s) ? `<p class="meta">${t('この店舗の料金表は公式サイトで画像・PDFとして公開されているため、アプリには掲載していません。')}</p>${s.price_url && s.price_url !== s.source_url ? officialLink(s) : ''}` : `
    <p class="price-cap">${t('料金（円・税込）')}${s.prices.every(x => x.drinks_included) ? ` · ${t('ドリンク飲み放題')}` : ''}</p>
    <div class="price-area">${cardTable(s, p, full)}</div>
    ${myColumn(s).mine ? `<button class="expand" aria-expanded="false">▼ ${t('他の区分も表示')}</button>` : ''}`}
    ${s.machines.length ? `<ul class="chips">${s.machines.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
    ${notes.length ? `<ul class="notes">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${hasPrices(s) ? (s.manual ? manualNote(s) : `<p class="meta source">${t('料金は{date}時点 · 最終確認 {checked}', { date: esc(s.prices_as_of), checked: esc(s.fetched_at) })}</p>`) : ''}`;
  const redraw = () => (panel.querySelector('.price-area').innerHTML = cardTable(s, p, full));
  panel.querySelectorAll('.party-toggle button').forEach(b => b.onclick = () => {
    p = b.dataset.party;
    panel.querySelectorAll('.party-toggle button').forEach(x => x.setAttribute('aria-pressed', x === b));
    redraw();
  });
  const expand = panel.querySelector('.expand');
  if (expand) expand.onclick = () => {
    full = !full;
    expand.setAttribute('aria-expanded', full);
    expand.textContent = full ? `▲ ${t('自分の区分だけ表示')}` : `▼ ${t('他の区分も表示')}`;
    redraw();
  };
  panel.querySelector('.choose').onclick = () => {
    plan.shopId = chosen ? null : s.id;
    savePlan();
    refresh();
    openCard(s, from);
    if (!chosen) showToast(t('「{name}」をプランに設定しました', { name: s.name }));
  };
  wirePanel();
  // Keep the tapped pin visible beside (desktop) or above (phone) the panel.
  const size = map.getSize(), pt = map.latLngToContainerPoint([s.lat, s.lng]);
  const target = innerWidth >= 768 ? L.point((size.x - panel.offsetWidth) / 2, size.y / 2) : L.point(size.x / 2, Math.max(40, (size.y - panel.offsetHeight) / 2));
  const offset = pt.subtract(target);
  if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) quietly(() => map.panBy(offset));
}

// ---- Comparison: what you could pay right now, cheapest first ----
const cmp = { mode: '30min', brand: null };
function openCompare() {
  view = { type: 'compare' };
  const now = new Date();
  const { ranked, none } = rankNow(shown, { mode: cmp.mode, party: party(), customer: me.customer, now, holidays });
  // Same price: the nearer shop first (when the location is known).
  ranked.sort((a, b) => a.main.row.yen - b.main.row.yen || (walkMeters(a.shop) ?? 0) - (walkMeters(b.shop) ?? 0));
  const inBrand = x => !cmp.brand || x.shop.brand === cmp.brand;
  const list = ranked.filter(inBrand);
  const counts = Object.fromEntries(brands.map(b => [b, ranked.filter(x => x.shop.brand === b).length]));
  // Each brand's two cheapest, kept together; brands ordered by their cheapest shop (list is already cheapest first).
  const perBrand = [...new Set(list.map(x => x.shop.brand))].flatMap(b => list.filter(x => x.shop.brand === b).slice(0, 2));
  const marks = marksOf(list.flatMap(x => [x.main.row, ...x.others.map(o => o.row)]));
  const win = o => (cmp.mode === '30min' ? slotText(o.entry.slot)
    : `〜${slotText(o.entry.slot).split('–')[1]}${o.last ? ` ${t('受付〜{time}', { time: slotText(o.last) })}` : ''}`);
  const unit = cmp.mode === '30min' ? t('/30分') : t('/人');
  const row = (x, i) => `<button class="rank-row" data-id="${esc(x.shop.id)}">
      ${i != null ? `<span class="rank">${i + 1}</span>` : ''}${badge(x.shop)}
      <span class="rr-main"><b>${esc(x.shop.name)}</b>${plan.shopId === x.shop.id ? ` <span class="now-badge">${t('選択中')}</span>` : ''}
        <span class="meta">${[walk(x.shop), `${esc(sName(x.main.entry))} ${win(x.main)}`].filter(Boolean).join(' · ')}</span>
        ${x.others.length ? `<span class="meta others">${t('他')}: ${x.others.slice(0, 3).map(o => `${esc(sName(o.entry))} ${cell(o.row, true)}`).join(' · ')}</span>` : ''}</span>
      <span class="rr-price">${cell(x.main.row, true)}<span class="meta">${unit}</span></span>
    </button>`;
  const noneShown = none.filter(x => !cmp.brand || x.shop.brand === cmp.brand);
  const j = jst(now);
  panel.innerHTML = `
    <div class="panel-head"><button class="close" aria-label="${t('閉じる')}">×</button></div>
    <h2>${t('料金比較')}</h2>
    <p class="meta">${t('いま {date} {time} · {me} · 1人あたり（円・税込）', { date: dateText(j.ymd), time: hm(now), me: esc(meLabel()) })}</p>
    <div class="toggle" role="group" aria-label="${t('プラン')}">${[['30min', t('30分')], ['free', t('フリータイム')]].map(([k, v]) => `<button data-mode="${k}" aria-pressed="${cmp.mode === k}">${v}</button>`).join('')}</div>
    <div class="chips-toggle brand-chips">
      <button data-brand="" aria-pressed="${!cmp.brand}">${t('全て')} ${ranked.length}</button>
      ${brands.filter(b => counts[b]).map(b => `<button data-brand="${b}" aria-pressed="${cmp.brand === b}">${badge({ brand: b }, true)}${esc(brandName(b))} ${counts[b]}</button>`).join('')}
    </div>
    ${list.length ? `
      ${!cmp.brand && perBrand.length > 1 ? `<h3>${t('ブランド別の最安')}</h3><div class="rank-list">${perBrand.map(x => row(x)).join('')}</div>` : ''}
      <h3>${t('すべて（安い順）')}</h3><div class="rank-list">${list.map((x, i) => row(x, i)).join('')}</div>`
    : `<p class="meta">${shown.length ? t('いま使えるこのプランの料金がありません。') : t('条件に合う店舗がありません。')}</p>`}
    ${noneShown.length ? `<details class="none-list"><summary>${t('いま料金のない店舗（{n}）', { n: noneShown.length })}</summary><ul class="no-price">${noneShown.map(x => `<li>${badge(x.shop, true)}<button class="shop-link" data-id="${esc(x.shop.id)}">${esc(x.shop.name)}</button>
        <span class="meta">${x.reason === 'no_prices' ? t('料金は公式サイトで') : cmp.mode === '30min' ? t('営業時間外など') : t('受付時間外など')}</span></li>`).join('')}</ul></details>` : ''}
    <ul class="notes">${markNotes(marks)}<li>${t('対象は「このエリアで検索」した範囲の店舗。地図を動かして検索し直すと変わります')}</li></ul>`;
  panel.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { cmp.mode = b.dataset.mode; openCompare(); });
  panel.querySelectorAll('[data-brand]').forEach(b => b.onclick = () => { cmp.brand = b.dataset.brand || null; openCompare(); });
  panel.querySelectorAll('.rank-row, .shop-link').forEach(b => b.onclick = () => openCard(byId(b.dataset.id), 'compare'));
  wirePanel();
}
compareBtn.onclick = () => (view?.type === 'compare' ? closePanel() : openCompare());

// ---- Panel plumbing ----
function wirePanel() {
  if (view.type !== 'plan') panel.onclick = null; // the plan editor uses one delegated handler
  panel.querySelector('.close').onclick = closePanel;
  const back = panel.querySelector('.back');
  if (back) back.onclick = openCompare;
  const key = view.type + (view.shop?.id ?? '');
  if (panel.dataset.view !== key || panel.hidden) panel.scrollTop = 0; // redrawing the same view keeps its scroll position
  panel.dataset.view = key;
  panel.hidden = false;
  document.body.classList.add('panel-open');
  document.querySelectorAll('.popover').forEach(p => p.remove());
}
function closePanel() {
  view = null;
  panel.hidden = true;
  panel.onclick = null;
  document.body.classList.remove('panel-open');
}
map.on('click', () => { closePanel(); document.querySelectorAll('.popover').forEach(p => p.remove()); });
document.addEventListener('keydown', e => e.key === 'Escape' && (closePanel(), document.querySelectorAll('.popover').forEach(p => p.remove())));
labelLocate();
