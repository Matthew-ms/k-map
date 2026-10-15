const BRAND_COLORS = { jankara: '#e60012' };
const BRAND_NAMES = { jankara: 'ジャンカラ' };
const PLAN = { '30min': '30分', free_time: 'フリータイム', night_pack: 'ナイトパック' };
const DAY = { weekday: '平日', weekend_holiday: '土日祝', sun_holiday: '日祝', fri_sun_hol_eve: '金土日祝祝前', fri_sat_hol_eve: '金土祝前' };
const CUSTOMERS = [['general', '一般'], ['member', '会員'], ['student', '学生'], ['student_member', '学生<br>会員'], ['senior', 'シニア']]; // general first: visible without scrolling on a phone

const map = L.map('map');
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const shops = await fetch('data/shops.json').then(r => r.json());
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const card = document.getElementById('card');

const pins = shops.map(s =>
  L.circleMarker([s.lat, s.lng], { radius: 10, color: '#fff', weight: 2, fillColor: BRAND_COLORS[s.brand] ?? '#666', fillOpacity: 1, bubblingMouseEvents: false })
    .on('click', () => openCard(s))
    .addTo(map));
map.fitBounds(L.featureGroup(pins).getBounds(), { padding: [30, 30] });
map.on('click', closeCard);
document.addEventListener('keydown', e => e.key === 'Escape' && closeCard());

function priceTable(prices, party) {
  // Rows arrive in page order; one table row per plan × slot × day, one column per customer type.
  const rows = new Map();
  for (const p of prices.filter(p => p.party === party)) {
    const key = `${p.plan}|${p.slot}|${p.day}`;
    if (!rows.has(key)) rows.set(key, { ...p, yen: {} });
    rows.get(key).yen[p.customer] = p.yen;
  }
  const slot = s => s.replace(/(^|-)0/g, '$1').replace('-', '–');
  return `<div class="table-wrap"><table class="prices">
    <thead><tr><th></th>${CUSTOMERS.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead>
    <tbody>${[...rows.values()].map(r => `<tr>
      <th><span class="plan">${PLAN[r.plan]}</span><br>${slot(r.slot)} <span class="day">${DAY[r.day]}</span></th>
      ${CUSTOMERS.map(([c]) => `<td>${r.yen[c] != null ? r.yen[c].toLocaleString() : '–'}</td>`).join('')}
    </tr>`).join('')}</tbody></table></div>`;
}

function openCard(s) {
  const hasSolo = s.prices.some(p => p.party === 'solo');
  const a = s.amenities, rooms = s.rooms;
  const yesNo = v => (v == null ? '不明' : v ? 'あり' : 'なし');
  card.innerHTML = `
    <button class="close" aria-label="閉じる">×</button>
    <p class="brand" style="--brand:${BRAND_COLORS[s.brand]}">${esc(BRAND_NAMES[s.brand] ?? s.brand)}</p>
    <h2>${esc(s.name)}</h2>
    <p>${esc(s.address)}</p>
    <p>${s.hours === '24h' ? '24時間営業' : esc(s.hours)}${s.tel ? ` · <a href="tel:${esc(s.tel)}">${esc(s.tel)}</a>` : ''}</p>
    <ul class="chips">${s.machines.map(m => `<li>${esc(m)}</li>`).join('')}</ul>
    <p class="meta">全${rooms.total ?? '?'}室${rooms.concept ? ` · コンセプトルーム${rooms.concept}室` : ''} · 喫煙スペース${yesNo(a.smoking_space)} · キッズルーム${yesNo(a.kids_room)}</p>
    <h3>料金（円・税込・ドリンク飲み放題）</h3>
    ${hasSolo ? `<div class="toggle" role="group" aria-label="人数">
      <button aria-pressed="true" data-party="group">2名以上</button><button aria-pressed="false" data-party="solo">1名</button></div>` : ''}
    <div class="price-area">${priceTable(s.prices, 'group')}</div>
    ${hasSolo ? '<p class="meta solo-hint" hidden>1名料金は追加料金がかかる時間帯のみ掲載されています。</p>' : ''}
    ${s.notes.length ? `<ul class="notes">${s.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${rooms.featured.length ? `<details><summary>おすすめルーム（${rooms.featured.length}）</summary><ul class="rooms">${rooms.featured.map(r =>
      `<li><b>${esc(r.no)}号室</b> ${esc(r.type)}（${esc(r.capacity)}名）· ${esc(r.machine)}${r.surcharge ? `<br><span class="meta">${esc(r.surcharge)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
    <p class="meta source"><a href="${esc(s.source_url)}" target="_blank" rel="noopener">公式ページ</a> · 料金は${esc(s.prices_as_of)}時点 · 最終確認 ${esc(s.fetched_at)}</p>`;
  card.querySelector('.close').onclick = closeCard;
  card.querySelectorAll('.toggle button').forEach(b => b.onclick = () => {
    card.querySelectorAll('.toggle button').forEach(x => x.setAttribute('aria-pressed', x === b));
    card.querySelector('.price-area').innerHTML = priceTable(s.prices, b.dataset.party);
    card.querySelector('.solo-hint').hidden = b.dataset.party !== 'solo';
  });
  card.hidden = false;
  card.scrollTop = 0;
  // Keep the tapped pin visible beside (desktop) or above (phone) the card.
  const size = map.getSize(), pt = map.latLngToContainerPoint([s.lat, s.lng]);
  const desktop = innerWidth >= 768;
  const target = desktop ? L.point((size.x - card.offsetWidth) / 2, size.y / 2) : L.point(size.x / 2, (size.y - card.offsetHeight) / 2);
  map.panBy(pt.subtract(target));
}

function closeCard() {
  card.hidden = true;
}
