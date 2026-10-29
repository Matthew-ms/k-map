// UI languages. Strings are keyed by their Japanese text: Japanese needs no dictionary, and a missing translation
// falls back to Japanese. Shop names, addresses and the chains' own remarks are never translated.
export const LANGS = { ja: '日本語', en: 'English', 'zh-Hant': '繁體中文' };
export const LANG_SHORT = { ja: '日本語', en: 'EN', 'zh-Hant': '中文' };

let lang = 'ja';
try { const saved = localStorage.getItem('kmap.lang'); if (LANGS[saved]) lang = saved; } catch {}
document.documentElement.lang = lang;
export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('kmap.lang', l); } catch {}
  document.documentElement.lang = l;
}

export function t(ja, vars = {}) {
  const s = (lang === 'ja' ? null : DICT[lang]?.[ja]) ?? ja;
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

// ---- Price words from the chains' tables (slot names): known words are replaced, unknown ones stay Japanese ----
const WORDS = [
  ['ショートフリータイム', 'Short free time', '短時段無限歡唱'],
  ['ロングフリータイム', 'Long free time', '長時段無限歡唱'],
  ['エンドレスフリータイム', 'Endless free time', '不限時無限歡唱'],
  ['深夜フリータイム', 'Late-night free time', '深夜無限歡唱'],
  ['夕方フリータイム', 'Evening free time', '傍晚無限歡唱'],
  ['朝フリータイム', 'Morning free time', '早上無限歡唱'],
  ['昼フリータイム', 'Daytime free time', '白天無限歡唱'],
  ['夜フリータイム', 'Night free time', '晚上無限歡唱'],
  ['深夜フリー', 'Late-night free time', '深夜無限歡唱'],
  ['フリータイム', 'Free time', '無限歡唱'],
  ['ナイトパック', 'Night pack', '夜間套餐'],
  ['3時間パック', '3-hour pack', '3小時套餐'],
  ['パック', 'pack', '套餐'],
  ['朝うた', 'Morning (朝うた)', '早晨 (朝うた)'],
  ['おはカラ', 'Morning (おはカラ)', '早晨 (おはカラ)'],
  ['30分', '30 min', '30分鐘'],
  ['深夜', 'Late-night ', '深夜'],
  ['夕方', 'Evening ', '傍晚'],
  ['朝', 'Morning ', '早上'],
  ['昼', 'Day ', '白天'],
  ['夜', 'Night ', '晚上'],
].sort((a, b) => b[0].length - a[0].length);
export function trWords(s) {
  if (lang === 'ja' || !s) return s;
  const i = lang === 'en' ? 1 : 2;
  for (const w of WORDS) s = s.split(w[0]).join(w[i]);
  return s.replace(/\s+/g, ' ').trim();
}

// ---- Day sets → words ("fri+sat+sun+hol+eve" → 金～日・祝・祝前 / Fri–Sun, holidays, holiday eves / 週五至週日、假日、假日前一天) ----
const MON_FIRST = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_NAMES = { ja: '月火水木金土日'.split(''), en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], 'zh-Hant': '一二三四五六日'.split('').map(d => `週${d}`) };
export function dayText(set) {
  const names = DAY_NAMES[lang], idx = MON_FIRST.map((d, i) => (set.includes(d) ? i : -1)).filter(i => i >= 0);
  const runs = [];
  for (const i of idx) (runs.at(-1)?.at(-1) === i - 1 ? runs.at(-1) : runs[runs.push([]) - 1]).push(i);
  const range = lang === 'en' ? '–' : lang === 'ja' ? '～' : '至';
  const parts = runs.flatMap(r => (r.length >= 3 ? [`${names[r[0]]}${range}${names[r.at(-1)]}`] : r.map(i => names[i])));
  if (set.includes('hol')) parts.push({ ja: '祝', en: 'holidays', 'zh-Hant': '假日' }[lang]);
  if (set.includes('eve')) parts.push({ ja: '祝前', en: 'holiday eves', 'zh-Hant': '假日前一天' }[lang]);
  return parts.join({ ja: '・', en: ', ', 'zh-Hant': '、' }[lang]);
}

// ---- Dates, money, walking ----
export function dateText(ymd) {
  const d = new Date(ymd), m = d.getUTCMonth() + 1, day = d.getUTCDate(), w = d.getUTCDay();
  if (lang === 'en') return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][w]} ${m}/${day}`;
  return `${m}/${day}(${(lang === 'ja' ? '日月火水木金土' : '日一二三四五六')[w]})`;
}
export const yenText = n => (lang === 'ja' ? `${n.toLocaleString()}円` : `¥${n.toLocaleString()}`);
export function walkText(m) {
  const km = (m / 1000).toFixed(1), min = Math.max(1, Math.ceil(m / 80));
  if (lang === 'en') return m > 4800 ? `~${km} km` : `${min} min walk`;
  if (lang === 'zh-Hant') return m > 4800 ? `約${km}公里` : `步行約${min}分鐘`;
  return m > 4800 ? `約${km}km` : `徒歩約${min}分`;
}

const DICT = {
  en: {
    '切り替える': 'Switch', 'から': 'From', '今に戻す': 'Back to now', 'このプランの時間で比較（{time}）': 'Compare at plan time ({time})',
    'プランの時刻': 'Plan time',
    'いまの最安': 'Cheapest right now', '{when}の最安': 'Cheapest at {when}', '1人あたり（円・税込）': 'per person (¥, tax incl.)', 'いつの料金': 'Prices at', 'いま {time}': 'Now {time}', '{date} {time}': '{date} {time}', '{n}店': '{n} shops', 'チェーン最安': 'cheapest of chain', 'この時間に使えるこのプランの料金がありません。': 'No prices for this plan at that time.', 'この時間に料金のない店舗（{n}）': 'Shops without a price at that time ({n})',
    学生会員: 'Student member', 学生: 'Student', 会員: 'Member', シニア: 'Senior', 一般: 'General', 学割: 'Student discount',
    ジャンカラ: 'Jankara', ビッグエコー: 'Big Echo', まねきねこ: 'Manekineko', カラオケ館: 'Karaoke-kan',
    '24時間営業': 'Open 24h',
    '＊1名料金の記載なし・2名以上の料金を表示': '＊No 1-person price listed: price for 2+ shown',
    '†{me}の料金がない店舗は、{used}の料金を表示': '†Shops without a {me} price show the {used} price',
    '+1D：ドリンク1杯の注文が別途必要（1ドリンクオーダー制）': '+1D: one drink must be ordered on top (one-drink minimum)',
    公式サイトで料金を見る: 'Official prices',
    '公式の料金表から手入力 · {date}確認': 'Typed in from the official price sheet · checked {date}',
    料金表を開く: 'Open price sheet',
    '確認から{days}日経っています。最新の料金は公式の料金表でご確認ください。': 'Checked {days} days ago. Please confirm current prices on the official sheet.',
    '{n}名・{type}': '{n} ppl · {type}',
    '{date} {start}〜 フリータイム': '{date} from {start} · free time', '{date} {start}〜{end}（{dur}）': '{date} {start}–{end} ({dur})',
    '30分': '30 min', '{h}時間': '{h} h', フリータイム: 'Free time',
    '{n}店の\n料金を比較': 'Compare\n{n} shops', 今日: 'Today', 店舗未選択: 'no shop chosen', '{n}店舗（拡大）': '{n} shops (zoom in)', '絞り込み（{n}）': 'Filter ({n})', 絞り込み: 'Filter',
    人数と区分を変更: 'Change people and price type', 言語: 'Language', このエリアで検索: 'Search this area',
    現在地: 'My location', この端末では位置情報を使えません: 'Location is not available on this device',
    '位置情報を取得できませんでした。ブラウザの設定で位置情報を許可してください。': 'Could not get your location. Please allow location in your browser settings.',
    '1人減らす': 'One fewer person', '{n}名': '{n} people', '1人増やす': 'One more person', 人数: 'People',
    '1名は1名料金、2名以上はグループ料金で計算': '1 person pays 1-person prices; 2 or more pay group prices',
    区分: 'Price type', この端末に保存されます: 'Saved on this device',
    ブランド: 'Chain', 機種: 'Machine', '{f}系すべて': 'All {f}', 上限料金: 'Max price',
    'いまの30分・{me}': '30 min right now · {me}', '{yen}以下': 'up to {yen}', 指定なし: 'No limit',
    'いま30分料金のない店舗（営業時間外など）は除外されます': 'Shops with no 30-min price right now (e.g. closed) are left out',
    '{n}店が該当': '{n} shops match', リセット: 'Reset',
    プラン: 'Plan', '約{yen}': 'about {yen}', 料金を確認: 'Check prices', 店舗を選ぶと金額を表示: 'Pick a shop to see the total',
    店舗の選択を解除: 'Clear the chosen shop', プランを開く: 'Open plan',
    'この店舗の料金はアプリに掲載していません（公式サイトの料金表が画像・PDFのため）。': 'This shop\'s prices are not in the app (the official price list is an image or PDF).',
    平日: 'Weekdays', '料金の掲載なし（営業時間外の可能性）': 'no price listed (possibly closed)',
    '{name}（〜{end}）なら1人{yen}で、こちらの方が安くなります。': '{name} (until {end}) is {yen} per person, which is cheaper.', 計算できません: 'Cannot calculate',
    '1人 {yen} × {n}名': '{yen} per person × {n}',
    '一部の時間帯に料金の掲載がありません。掲載分のみ：1人 {yen}': 'Some of the time has no listed price. Listed part only: {yen} per person',
    'この開始時刻から使えるフリータイムがありません（最終受付を過ぎています）。': 'No free time can start at this time (past last entry).',
    'この開始時刻から使えるフリータイムがありません。': 'No free time can start at this time.',
    '目安です。部屋の追加料金・有料ドリンクコース・時間帯をまたぐ際の扱いなどで実際の金額は変わります。': 'An estimate. Room surcharges, paid drink courses and how shops count time across slots can change the real amount.',
    '全員が「{type}」として計算。料金は{date}時点': 'Everyone counted as "{type}". Prices as of {date}',
    閉じる: 'Close',
    '店舗が未選択です。地図のピンから店舗を開き「この店にする」を押してください。': 'No shop chosen yet. Open a shop from a map pin and tap "Choose this shop".',
    日付: 'Date', 開始: 'Start', 利用方法: 'How', 時間で指定: 'By duration',
    '30分減らす': '30 min less', '30分増やす': '30 min more', '最終受付 {time}': 'last entry {time}', 受付終了: 'entry closed', '/人': '/person',
    'この開始時刻に使えるフリータイムの掲載がありません。': 'No free time is listed for this start time.',
    '店舗を選ぶと、使えるフリータイムが表示されます。': 'Pick a shop to see the free-time options.', いま: 'Now', 休日: 'Weekend/hol.',
    いまの時間帯の30分料金は掲載されていません: 'No 30-min price is listed for right now',
     比較に戻る: 'Back to comparison', 選択中: 'Chosen', この店にする: 'Choose this shop',
    料金表の人数: 'Price table for', '1名': '1 person', '2名以上': '2+ people',
    'この店舗の料金表は公式サイトで画像・PDFとして公開されているため、アプリには掲載していません。': 'This shop publishes its prices as an image or PDF, so they are not in the app.',
    '料金（円・税込）': 'Prices (¥, tax incl.)', ドリンク飲み放題: 'drinks included',
     
    '料金は{date}時点 · 最終確認 {checked}': 'Prices as of {date} · last checked {checked}',
    店舗ページを開く: 'Open shop page', '（あなた）': ' (you)', 地図: 'Map', 公式: 'Site', 'お店からの注意（{n}）': 'Shop notes ({n})', 空き状況・予約: 'Availability & booking', 電話で空き確認: 'Call to check rooms', Googleマップ: 'Google Maps', '{plans}は{days}': '{days} for {plans}', 公式の表記: 'site wording',
    '「{name}」をプランに設定しました': '"{name}" set as your plan',
    '受付〜{time}': 'entry until {time}', '/30分': '/30 min',
    全て: 'All',
    'いま使えるこのプランの料金がありません。': 'No price for this plan right now.', '条件に合う店舗がありません。': 'No shops match.',
    'いま料金のない店舗（{n}）': 'Shops with no price right now ({n})', 料金は公式サイトで: 'prices on the official site',
    営業時間外など: 'closed or similar', 受付時間外など: 'entry closed or similar',
    '対象は「このエリアで検索」した範囲の店舗。地図を動かして検索し直すと変わります': 'Covers shops in the area of your last "Search this area". Move the map and search again to change it.',
  },
  'zh-Hant': {
    '切り替える': '切換', 'から': '起', '今に戻す': '改回現在', 'このプランの時間で比較（{time}）': '以方案時間比較（{time}）',
    'プランの時刻': '方案時間',
    'いまの最安': '現在最便宜', '{when}の最安': '{when}最便宜', '1人あたり（円・税込）': '每人（日圓・含稅）', 'いつの料金': '哪個時間的價格', 'いま {time}': '現在 {time}', '{date} {time}': '{date} {time}', '{n}店': '{n}家', 'チェーン最安': '該連鎖最便宜', 'この時間に使えるこのプランの料金がありません。': '這個時間沒有此方案的價格。', 'この時間に料金のない店舗（{n}）': '這個時間沒有價格的店舖（{n}）',
    学生会員: '學生會員', 学生: '學生', 会員: '會員', シニア: '長者', 一般: '一般', 学割: '學生優惠',
    '24時間営業': '24小時營業',
    '＊1名料金の記載なし・2名以上の料金を表示': '＊未列出1人價格，顯示2人以上的價格',
    '†{me}の料金がない店舗は、{used}の料金を表示': '†沒有{me}價格的店舖，顯示{used}價格',
    '+1D：ドリンク1杯の注文が別途必要（1ドリンクオーダー制）': '+1D：需另外點一杯飲料（低消一杯飲料）',
    公式サイトで料金を見る: '官方價格',
    '公式の料金表から手入力 · {date}確認': '依官方價目表手動輸入 · {date}確認',
    料金表を開く: '開啟價目表',
    '確認から{days}日経っています。最新の料金は公式の料金表でご確認ください。': '距確認已過{days}天，最新價格請以官方價目表為準。',
    '{n}名・{type}': '{n}人・{type}',
    '{date} {start}〜 フリータイム': '{date} {start}起 · 無限歡唱', '{date} {start}〜{end}（{dur}）': '{date} {start}–{end}（{dur}）',
    '30分': '30分鐘', '{h}時間': '{h}小時', フリータイム: '無限歡唱',
    '{n}店の\n料金を比較': '比較\n{n}家店', 今日: '今天', 店舗未選択: '未選店舖', '{n}店舗（拡大）': '{n}家店（放大）', '絞り込み（{n}）': '篩選（{n}）', 絞り込み: '篩選',
    人数と区分を変更: '變更人數與身分', 言語: '語言', このエリアで検索: '搜尋此區域',
    現在地: '目前位置', この端末では位置情報を使えません: '此裝置無法使用定位',
    '位置情報を取得できませんでした。ブラウザの設定で位置情報を許可してください。': '無法取得位置，請在瀏覽器設定中允許定位。',
    '1人減らす': '減少1人', '{n}名': '{n}人', '1人増やす': '增加1人', 人数: '人數',
    '1名は1名料金、2名以上はグループ料金で計算': '1人以單人價格計算，2人以上以團體價格計算',
    区分: '身分', この端末に保存されます: '儲存在此裝置',
    ブランド: '品牌', 機種: '機種', '{f}系すべて': '全部{f}', 上限料金: '價格上限',
    'いまの30分・{me}': '目前的30分鐘・{me}', '{yen}以下': '{yen}以下', 指定なし: '不限',
    'いま30分料金のない店舗（営業時間外など）は除外されます': '目前沒有30分鐘價格的店舖（如非營業時間）不列入',
    '{n}店が該当': '符合{n}家', リセット: '重設',
    プラン: '方案', '約{yen}': '約{yen}', 料金を確認: '查看價格', 店舗を選ぶと金額を表示: '選擇店舖後顯示金額',
    店舗の選択を解除: '取消選擇店舖', プランを開く: '開啟方案',
    'この店舗の料金はアプリに掲載していません（公式サイトの料金表が画像・PDFのため）。': '此店舖的價格未收錄（官方價目表為圖片或PDF）。',
    平日: '平日', '料金の掲載なし（営業時間外の可能性）': '未列出價格（可能為非營業時間）',
    '{name}（〜{end}）なら1人{yen}で、こちらの方が安くなります。': '{name}（至{end}）每人{yen}，比較便宜。', 計算できません: '無法計算',
    '1人 {yen} × {n}名': '每人 {yen} × {n}人',
    '一部の時間帯に料金の掲載がありません。掲載分のみ：1人 {yen}': '部分時段未列出價格。僅計已列出部分：每人 {yen}',
    'この開始時刻から使えるフリータイムがありません（最終受付を過ぎています）。': '此開始時間沒有可用的無限歡唱（已過最後入場時間）。',
    'この開始時刻から使えるフリータイムがありません。': '此開始時間沒有可用的無限歡唱。',
    '目安です。部屋の追加料金・有料ドリンクコース・時間帯をまたぐ際の扱いなどで実際の金額は変わります。': '僅供參考。房間加價、付費飲料方案及跨時段的計算方式可能使實際金額不同。',
    '全員が「{type}」として計算。料金は{date}時点': '全員以「{type}」計算。價格為{date}的資料',
    閉じる: '關閉',
    '店舗が未選択です。地図のピンから店舗を開き「この店にする」を押してください。': '尚未選擇店舖。請從地圖圖釘開啟店舖並按「選這家」。',
    日付: '日期', 開始: '開始', 利用方法: '方式', 時間で指定: '指定時間',
    '30分減らす': '減少30分鐘', '30分増やす': '增加30分鐘', '最終受付 {time}': '最後入場 {time}', 受付終了: '已停止入場', '/人': '/人',
    'この開始時刻に使えるフリータイムの掲載がありません。': '此開始時間沒有列出可用的無限歡唱。',
    '店舗を選ぶと、使えるフリータイムが表示されます。': '選擇店舖後會顯示可用的無限歡唱。', いま: '現在', 休日: '假日',
    いまの時間帯の30分料金は掲載されていません: '目前時段未列出30分鐘價格',
     比較に戻る: '返回比較', 選択中: '已選擇', この店にする: '選這家',
    料金表の人数: '價目表人數', '1名': '1人', '2名以上': '2人以上',
    'この店舗の料金表は公式サイトで画像・PDFとして公開されているため、アプリには掲載していません。': '此店舖的價目表以圖片或PDF公布，因此未收錄。',
    '料金（円・税込）': '價格（日圓・含稅）', ドリンク飲み放題: '飲料暢飲',
     
    '料金は{date}時点 · 最終確認 {checked}': '價格為{date}的資料 · 最後確認 {checked}',
    店舗ページを開く: '開啟店舖頁面', '（あなた）': '（你）', 地図: '地圖', 公式: '官網', 'お店からの注意（{n}）': '店家注意事項（{n}）', 空き状況・予約: '空房・預約', 電話で空き確認: '致電查詢空房', Googleマップ: 'Google 地圖', '{plans}は{days}': '{plans}為{days}', 公式の表記: '官網原文',
    '「{name}」をプランに設定しました': '已將「{name}」設為方案',
    '受付〜{time}': '入場至{time}', '/30分': '/30分鐘',
    全て: '全部',
    'いま使えるこのプランの料金がありません。': '目前沒有此方案的價格。', '条件に合う店舗がありません。': '沒有符合條件的店舖。',
    'いま料金のない店舗（{n}）': '目前沒有價格的店舖（{n}）', 料金は公式サイトで: '價格請見官網',
    営業時間外など: '非營業時間等', 受付時間外など: '非入場時間等',
    '対象は「このエリアで検索」した範囲の店舗。地図を動かして検索し直すと変わります': '範圍為上次「搜尋此區域」的店舖。移動地圖重新搜尋即可變更。',
  },
};
