// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: utensils;
// cit_dining_widget


// -------------------- データ --------------------
// メニューの JSON（GitHub Actions が毎日更新）
const DATA_URL = "https://raw.githubusercontent.com/Owen-ovo/cit-dining-widget/main/data/menu.json";
const DINING_PAGE = "https://www.cit-s.com/dining/";

// ウィジェットのパラメータで表示する食堂を選ぶ
//   tsudanuma : 津田沼
//   shin1     : 新習志野 1F
//   shin2     : 新習志野 2F
//   shin      : 新習志野 1F と 2F
// 空欄のときは DEFAULT_TARGET
const DEFAULT_TARGET = "tsudanuma";
const TARGETS = {
  tsudanuma: ["tsudanuma"],
  shin1: ["shin1"],
  shin2: ["shin2"],
  shin: ["shin1", "shin2"],
};

// この時刻を過ぎたら翌日のメニューを表示する
const SWITCH_TO_TOMORROW_HOUR = 20;
// この時刻を過ぎたら今日の朝定食を表示しない
const BREAKFAST_END_HOUR = 10;


// -------------------- ウィジェットサイズ検出 --------------------
// 実機（ウィジェットとして配置時）は config.widgetFamily が
// "small" / "medium" / "large" / "extraLarge"（extraLargeはiPadのみ）を返す。
// Scriptableアプリ内でスクリプトを直接実行してプレビューする場合は
// config.widgetFamily が取得できないため、TEST_FAMILY と TEST_TARGET で確認したい表示を指定できる。
const TEST_FAMILY = null; // 例: "small" / "medium" / "large" / "extraLarge"
const TEST_TARGET = null; // 例: "tsudanuma" / "shin"
const FAMILY = config.widgetFamily || TEST_FAMILY || "medium";

// ウィジェットの色設定（バス時刻表ウィジェットと同じ色）
const WIDGET_BG_COLOR = "#0C1220";   // 背景色
const CAFETERIA_COLOR = { tsudanuma: "#1E3A8A", shin1: "#EA580C", shin2: "#C2410C" };

// サイズ（ファミリー）ごとのレイアウト設定。余白・角丸・文字サイズはバス時刻表ウィジェットにそろえている
// compact: true の場合は縦積みの簡易リスト表示（iPhoneの小サイズ向け）
// compact: false の場合は食堂ごとのカードを同じ幅で横並び表示（サイズに応じて拡大）
// stackCards: true の場合、食堂が 2 つのときはカードを縦に重ねる（料理名を読める幅を残すため）
// rows は 1 つの食堂に表示する料理の行数、labelWidth は分類名の列の幅。
// 食堂が 2 つのときは multiRows と multiFontSize を使う
const LAYOUT = {
  small: {
    compact: true,
    padding: { top: 10, left: 12, bottom: 10, right: 12 },
    rowSpacing: 8,
    fontSize: { dot: 10, label: 11, group: 9, item: 12, price: 10, footer: 8 },
    rows: 4,
    multiRows: 2,
    labelWidth: 28
  },
  medium: {
    compact: false,
    padding: { top: 8, left: 10, bottom: 8, right: 10 },
    cardPadding: { top: 6, left: 12, bottom: 6, right: 12 },
    stackSpacing: 10,
    cardRadius: 18,
    fontSize: { title: 13, day: 11, group: 10, item: 13, price: 11, footer: 11 },
    footerSpacer: 6,
    rows: 5,
    multiRows: 5,
    multiFontSize: { group: 9, item: 11, price: 10 },
    labelWidth: 30
  },
  large: {
    compact: false,
    padding: { top: 14, left: 16, bottom: 14, right: 16 },
    cardPadding: { top: 12, left: 16, bottom: 12, right: 16 },
    stackSpacing: 14,
    cardRadius: 22,
    fontSize: { title: 16, day: 13, group: 12, item: 15, price: 13, footer: 14 },
    footerSpacer: 10,
    stackCards: true,
    rows: 12,
    multiRows: 5,
    labelWidth: 38
  },
  extraLarge: {
    compact: false,
    padding: { top: 18, left: 22, bottom: 18, right: 22 },
    cardPadding: { top: 16, left: 22, bottom: 16, right: 22 },
    stackSpacing: 20,
    cardRadius: 26,
    fontSize: { title: 20, day: 16, group: 14, item: 18, price: 16, footer: 17 },
    footerSpacer: 12,
    stackCards: true,
    rows: 14,
    multiRows: 6,
    labelWidth: 46
  }
};
const L = LAYOUT[FAMILY] || LAYOUT.medium;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 料理の分類。表示はこの順に並ぶ
const GROUPS = ["朝食", "定食", "丼", "麺", "カレー", "パスタ", "サラダ", "弁当", "夕食", "その他"];

function groupOf(item) {
  const c = item.category;
  if (c.includes("朝")) return "朝食";
  if (c.includes("夕")) return "夕食";
  if (/麺|ラーメン|うどん|そば/.test(c)) return "麺";
  if (c.includes("カレー")) return "カレー";
  if (c.includes("パスタ")) return "パスタ";
  if (c.includes("サラダ")) return "サラダ";
  if (c.includes("弁当")) return "弁当";
  if (c.includes("丼")) return "丼";
  if (c.includes("定食")) return "定食";
  // 見出しが値段だけの行は料理名で分ける
  if (c === "") return item.name.endsWith("丼") ? "丼" : "定食";
  return "その他";
}

function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseIso(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(iso) {
  const d = parseIso(iso);
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
}

// 「今日」「明日」。それより先の日は null
function relativeDay(iso, now) {
  const diff = Math.round((parseIso(iso) - parseIso(isoDate(now))) / 86400000);
  return diff === 0 ? "今日" : diff === 1 ? "明日" : null;
}

// 表示したい日以降で、メニュー表にある最初の日を返す。表にない日（日曜など）は次の営業日になる
function pickDay(cafeteria, now) {
  const target = new Date(now);
  if (now.getHours() >= SWITCH_TO_TOMORROW_HOUR) target.setDate(target.getDate() + 1);
  const targetIso = isoDate(target);
  const days = [...cafeteria.days].sort((a, b) => a.date.localeCompare(b.date));
  return days.find((d) => d.date >= targetIso) ?? null;
}

// 行数に収まるように、分類ごとに 1 品ずつ順番に選ぶ。どの分類があるかを先に見せるため
function selectRows(items, maxRows) {
  const byGroup = new Map(GROUPS.map((g) => [g, []]));
  for (const item of items) byGroup.get(groupOf(item)).push(item);
  const picked = new Map(GROUPS.map((g) => [g, []]));
  let count = 0;
  for (let round = 0; count < maxRows; round++) {
    let added = false;
    for (const g of GROUPS) {
      const item = byGroup.get(g)[round];
      if (item && count < maxRows) {
        picked.get(g).push(item);
        count++;
        added = true;
      }
    }
    if (!added) break;
  }
  return { groups: GROUPS.map((g) => [g, picked.get(g)]).filter(([, list]) => list.length), rest: items.length - count };
}

async function loadData() {
  const fm = FileManager.local();
  const cachePath = fm.joinPath(fm.documentsDirectory(), "cit_dining_cache.json");
  try {
    const req = new Request(DATA_URL);
    req.timeoutInterval = 10;
    const data = await req.loadJSON();
    fm.writeString(cachePath, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(cachePath)) return JSON.parse(fm.readString(cachePath));
    throw e;
  }
}

function addText(stack, text, font, color, opacity = 1) {
  const t = stack.addText(text);
  t.font = font;
  t.textColor = color;
  t.textOpacity = opacity;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.75;
  return t;
}

// 横いっぱいに広がる1行。カードの幅をそろえるために使う
function addLine(stack) {
  const line = stack.addStack();
  line.layoutHorizontally();
  line.centerAlignContent();
  return line;
}

// 分類名・料理名・値段の 1 行。分類名は分類の最初の行にだけ出す
function addRow(stack, group, name, price, colors, fs) {
  const row = addLine(stack);
  const labelBox = row.addStack();
  labelBox.size = new Size(L.labelWidth, 0);
  if (group) addText(labelBox, group, Font.semiboldSystemFont(fs.group), colors.sub, colors.subOpacity);
  labelBox.addSpacer();
  addText(row, name, Font.systemFont(fs.item), colors.main);
  row.addSpacer(4);
  row.addSpacer();
  if (price != null) addText(row, `¥${price}`, Font.mediumSystemFont(fs.price), colors.sub, colors.subOpacity);
}

// 分類ごとにまとめた料理の行
function addMenuRows(stack, selection, colors, fs) {
  selection.groups.forEach(([group, items], gi) => {
    if (gi > 0) stack.addSpacer(3);
    items.forEach((item, i) => addRow(stack, i === 0 ? group : null, item.name, item.price, colors, fs));
  });
}

// 表示する料理（朝食の時間を過ぎた今日の朝定食は省く）
function menuOf(day, now) {
  const pastBreakfast = day.date === isoDate(now) && now.getHours() >= BREAKFAST_END_HOUR;
  return day.items.filter((i) => !(pastBreakfast && groupOf(i) === "朝食"));
}

// 料理を出せないときの一言。出せるときは null
function emptyMessage(day) {
  if (!day) return "メニュー未掲載";
  if (day.items.length === 0) return day.note || "日替わりメニューなし";
  return null;
}

function dayLabel(day, now) {
  return relativeDay(day.date, now) ?? formatDate(day.date);
}


// -------------------- ウィジェット作成 --------------------
const now = new Date();
const widget = new ListWidget();
widget.backgroundColor = new Color(WIDGET_BG_COLOR);
widget.setPadding(L.padding.top, L.padding.left, L.padding.bottom, L.padding.right);
widget.url = DINING_PAGE;
// 次の 0 時過ぎ（日付が変わったら即更新）か 1 時間後の早いほう
const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1);
widget.refreshAfterDate = new Date(Math.min(nextMidnight, now.getTime() + 60 * 60 * 1000));

async function show(w) {
  if (config.runsInWidget) {
    Script.setWidget(w);
  } else {
    const present = { small: "presentSmall", medium: "presentMedium", large: "presentLarge", extraLarge: "presentExtraLarge" };
    await w[present[FAMILY] || "presentMedium"]();
  }
  Script.complete();
}

let data = null;
try {
  data = await loadData();
} catch (e) {
  const text = widget.addText("メニューを取得できませんでした");
  text.font = Font.mediumSystemFont(12);
  text.textColor = Color.lightGray();
}

if (data) {
  const targetKey = (config.runsInWidget ? args.widgetParameter : TEST_TARGET)?.trim() || DEFAULT_TARGET;
  const ids = TARGETS[targetKey] || TARGETS[DEFAULT_TARGET];
  const cafeterias = ids.map((id) => data.cafeterias.find((c) => c.id === id)).filter(Boolean);
  const multi = cafeterias.length > 1;
  const maxRows = multi ? L.multiRows : L.rows;
  const fs = { ...L.fontSize, ...(multi ? L.multiFontSize : {}) };
  const entries = cafeterias.map((cafeteria) => {
    const day = pickDay(cafeteria, now);
    const selection = day && day.items.length ? selectRows(menuOf(day, now), maxRows) : null;
    return { cafeteria, day, selection, color: new Color(CAFETERIA_COLOR[cafeteria.id] || "#334155") };
  });

  if (L.compact) {
    // ---- スマホの小サイズ向け：縦積みの簡易リスト表示 ----
    const list = widget.addStack();
    list.layoutVertically();
    list.spacing = L.rowSpacing;
    const colors = { main: Color.white(), sub: Color.lightGray(), subOpacity: 1 };

    for (const { cafeteria, day, selection, color } of entries) {
      const block = list.addStack();
      block.layoutVertically();

      const row = addLine(block);
      addText(row, "●", Font.boldSystemFont(L.fontSize.dot), color);
      row.addSpacer(4);
      addText(row, cafeteria.name, Font.systemFont(L.fontSize.label), Color.lightGray());
      row.addSpacer();
      if (day) addText(row, dayLabel(day, now), Font.systemFont(L.fontSize.label), Color.lightGray());
      block.addSpacer(3);

      const message = emptyMessage(day);
      if (message) addText(block, message, Font.mediumSystemFont(L.fontSize.item), Color.white());
      else addMenuRows(block, selection, colors, fs);
    }
    widget.addSpacer();
  } else {
    // ---- 標準・拡大サイズ向け：食堂ごとのカードを横並び表示 ----
    const h = widget.addStack();
    if (multi && L.stackCards) h.layoutVertically();
    else h.layoutHorizontally();
    h.spacing = L.stackSpacing;
    const colors = { main: Color.white(), sub: Color.white(), subOpacity: 0.8 };

    for (const { cafeteria, day, selection, color } of entries) {
      const card = h.addStack();
      card.layoutVertically();
      card.backgroundColor = color;
      card.cornerRadius = L.cardRadius;
      card.setPadding(L.cardPadding.top, L.cardPadding.left, L.cardPadding.bottom, L.cardPadding.right);

      const titleLine = addLine(card);
      addText(titleLine, cafeteria.name, Font.boldSystemFont(L.fontSize.title), Color.white());
      titleLine.addSpacer();
      if (day) addText(titleLine, dayLabel(day, now), Font.systemFont(L.fontSize.day), Color.white(), 0.8);

      card.addSpacer(5);

      const message = emptyMessage(day);
      if (message) {
        addText(card, message, Font.mediumSystemFont(L.fontSize.item), Color.white());
      } else {
        addMenuRows(card, selection, colors, fs);
        // 定番は食堂ごとに違うので、1 つの食堂を大きく表示するときだけ出す
        const common = (cafeteria.common || []).slice(0, 4);
        if (!multi && FAMILY !== "medium" && common.length) {
          card.addSpacer(3);
          addRow(card, "定番", common.map((c) => `${c.name} ¥${c.price}`).join(" · "), null, colors, fs);
        }
      }
      // 伸び縮みする余白。カードをウィジェットの高さいっぱいまで伸ばす
      card.addSpacer();
    }

    widget.addSpacer(L.footerSpacer);
  }

  // フッター
  const first = entries.find((e) => e.day)?.day;
  const rest = entries.reduce((sum, e) => sum + (e.selection?.rest || 0), 0);
  const parts = [];
  if (first) {
    parts.push(formatDate(first.date) + (first.note && first.items.length ? ` ${first.note}` : ""));
    const relative = relativeDay(first.date, now);
    parts.push(relative ? `${relative}のメニュー` : "次のメニュー");
  }
  if (rest > 0) parts.push(`ほか${rest}品`);
  const footer = widget.addText(parts.join(" · ") || "学食メニュー");
  footer.font = Font.systemFont(L.fontSize.footer);
  footer.textColor = Color.lightGray();
  footer.lineLimit = 1;
}

await show(widget);
