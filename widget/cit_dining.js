// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-gray; icon-glyph: utensils;

// ===== 設定 =====
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

// この時刻を過ぎたら翌日のメニューを表示する
const SWITCH_TO_TOMORROW_HOUR = 20;
// この時刻を過ぎたら今日の朝定食を表示しない
const BREAKFAST_END_HOUR = 10;

const WIDGET_BG_COLOR = "#0C1220";
const TEXT_COLOR = "#F1F5F9";
const SUB_TEXT_COLOR = "#8B97AD";
const DIVIDER_COLOR = "#1E293B";
// 食堂ごとの色（見出しの帯・日付のバッジ・分類名）
const CAFETERIA_COLOR = {
  tsudanuma: "#60A5FA",
  shin1: "#34D399",
  shin2: "#FB923C",
};

// サイズごとの見た目。rows は 1 つの食堂に表示する料理の行数（食堂を 2 つ並べるときは multiRows）。
// compactHeader は見出しの日付を省き、バッジだけにする（今日・明日以外はバッジに日付を出す）
const LAYOUT = {
  small: { padding: 12, rows: 5, multiRows: 2, labelWidth: 30, compactHeader: true, fontSize: { title: 13, badge: 9, date: 10, label: 9, item: 11.5, price: 10.5 } },
  medium: { padding: 14, rows: 6, multiRows: 6, labelWidth: 32, fontSize: { title: 14, badge: 9.5, date: 11, label: 9.5, item: 12.5, price: 11.5 } },
  large: { padding: 16, rows: 15, multiRows: 8, labelWidth: 36, fontSize: { title: 16, badge: 10, date: 12, label: 10, item: 13.5, price: 12.5 } },
  extraLarge: { padding: 18, rows: 15, multiRows: 8, labelWidth: 36, fontSize: { title: 16, badge: 10, date: 12, label: 10, item: 13.5, price: 12.5 } },
};

// Scriptable 内で実行したときのプレビューサイズとパラメータ
const TEST_FAMILY = "medium";
const TEST_TARGET = "tsudanuma";
// ===== 設定ここまで =====

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
// 食堂を 2 つ並べるときは、キャンパス名と日付を 1 回だけ出し、各列は short の名前にする
const TARGETS = {
  tsudanuma: { ids: ["tsudanuma"] },
  shin1: { ids: ["shin1"] },
  shin2: { ids: ["shin2"] },
  shin: { ids: ["shin1", "shin2"], title: "新習志野", short: { shin1: "1F", shin2: "2F" } },
};

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

function addText(stack, text, font, color) {
  const t = stack.addText(text);
  t.font = font;
  t.textColor = new Color(color);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.75;
  return t;
}

// 見出し: 色の帯・名前・「今日」バッジと日付。day が null なら日付は出さない
function addHeader(stack, name, day, now, layout, accent, titleSize) {
  const fs = layout.fontSize;
  const header = stack.addStack();
  header.centerAlignContent();
  const bar = header.addStack();
  bar.size = new Size(3, titleSize);
  bar.cornerRadius = 1.5;
  bar.backgroundColor = new Color(accent);
  header.addSpacer(5);
  addText(header, name, Font.boldSystemFont(titleSize), TEXT_COLOR);
  header.addSpacer();
  if (!day) return;
  const relative = relativeDay(day.date, now);
  const badge = header.addStack();
  badge.setPadding(1, 5, 1, 5);
  badge.cornerRadius = 4;
  badge.backgroundColor = new Color(accent, 0.2);
  addText(badge, relative ?? formatDate(day.date), Font.boldSystemFont(fs.badge), accent);
  if (relative && !layout.compactHeader) {
    header.addSpacer(4);
    addText(header, formatDate(day.date), Font.mediumSystemFont(fs.date), SUB_TEXT_COLOR);
  }
}

function addMessage(stack, text, layout) {
  stack.addSpacer(6);
  addText(stack, text, Font.mediumSystemFont(layout.fontSize.item), SUB_TEXT_COLOR);
}

function addRow(stack, label, item, layout, accent) {
  const fs = layout.fontSize;
  const row = stack.addStack();
  row.centerAlignContent();
  const labelBox = row.addStack();
  labelBox.size = new Size(layout.labelWidth, 0);
  if (label) addText(labelBox, label, Font.semiboldSystemFont(fs.label), accent);
  labelBox.addSpacer();
  addText(row, item.name, Font.systemFont(fs.item), TEXT_COLOR);
  row.addSpacer(4);
  row.addSpacer();
  if (item.price != null) addText(row, `¥${item.price}`, Font.mediumSystemFont(fs.price), SUB_TEXT_COLOR);
}

function addDivider(stack) {
  const line = stack.addStack();
  line.size = new Size(0, 1);
  line.backgroundColor = new Color(DIVIDER_COLOR);
  line.addSpacer();
}

// 1 つの食堂の見出しとメニュー。表示しきれなかった品数を返す。
// sharedDate はまとめ見出しに出した日付で、同じ日なら列の見出しには日付を出さない
function addCafeteria(stack, cafeteria, now, layout, maxRows, shortName, sharedDate) {
  const accent = CAFETERIA_COLOR[cafeteria.id] ?? SUB_TEXT_COLOR;
  const day = pickDay(cafeteria, now);
  const column = stack.addStack();
  column.layoutVertically();
  const titleSize = shortName ? layout.fontSize.item : layout.fontSize.title;
  addHeader(column, shortName ?? cafeteria.name, day?.date === sharedDate ? null : day, now, layout, accent, titleSize);

  if (!day) {
    addMessage(column, "メニュー未掲載", layout);
    return 0;
  }
  if (day.items.length === 0) {
    addMessage(column, day.note || "日替わりメニューなし", layout);
    return 0;
  }
  if (day.note) {
    column.addSpacer(2);
    addText(column, day.note, Font.mediumSystemFont(layout.fontSize.label), accent);
  }

  // 今日の分を朝食の時間帯より後に表示するときは朝定食を省く
  const pastBreakfast = day.date === isoDate(now) && now.getHours() >= BREAKFAST_END_HOUR;
  const available = day.items.filter((i) => !(pastBreakfast && groupOf(i) === "朝食"));
  const { groups, rest } = selectRows(available, maxRows);
  column.addSpacer(5);
  groups.forEach(([group, items], gi) => {
    if (gi > 0) column.addSpacer(3);
    items.forEach((item, i) => {
      if (i > 0) column.addSpacer(1);
      addRow(column, i === 0 ? group : null, item, layout, accent);
    });
  });
  return rest;
}

function addFooter(widget, cafeterias, rest, family, layout) {
  // 定番は食堂ごとに違うので、1 つの食堂を大きく表示するときだけ出す
  const common = cafeterias.length === 1 && (family === "large" || family === "extraLarge")
    ? (cafeterias[0].common ?? []).slice(0, 4)
    : [];
  if (rest <= 0 && common.length === 0) return;
  const footer = widget.addStack();
  footer.centerAlignContent();
  if (common.length) {
    const text = "定番  " + common.map((c) => `${c.name} ¥${c.price}`).join(" · ");
    addText(footer, text, Font.systemFont(layout.fontSize.label), SUB_TEXT_COLOR);
  }
  footer.addSpacer();
  if (rest > 0) addText(footer, `ほか${rest}品`, Font.mediumSystemFont(layout.fontSize.label), SUB_TEXT_COLOR);
}

async function createWidget(family, targetKey) {
  const layout = LAYOUT[family] ?? LAYOUT.medium;
  const widget = new ListWidget();
  widget.backgroundColor = new Color(WIDGET_BG_COLOR);
  widget.setPadding(layout.padding, layout.padding, layout.padding, layout.padding);
  widget.url = DINING_PAGE;

  const now = new Date();
  // 次の 0 時過ぎ（日付が変わったら即更新）か 1 時間後の早いほう
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 1);
  widget.refreshAfterDate = new Date(Math.min(nextMidnight, now.getTime() + 60 * 60 * 1000));

  let data;
  try {
    data = await loadData();
  } catch (e) {
    addText(widget, "メニューを取得できませんでした", Font.mediumSystemFont(layout.fontSize.item), SUB_TEXT_COLOR);
    return widget;
  }

  const targetDef = TARGETS[targetKey] ?? TARGETS[DEFAULT_TARGET];
  const cafeterias = targetDef.ids.map((id) => data.cafeterias.find((c) => c.id === id)).filter(Boolean);
  const multi = cafeterias.length > 1;
  let sharedDate = null;
  if (multi) {
    const firstDay = pickDay(cafeterias[0], now);
    sharedDate = firstDay?.date ?? null;
    addHeader(widget, targetDef.title, firstDay, now, layout, SUB_TEXT_COLOR, layout.fontSize.title);
    widget.addSpacer(layout.padding / 2);
  }
  const maxRows = multi ? layout.multiRows : layout.rows;
  // medium は横に並べ、small と large は縦に重ねる
  const sideBySide = multi && family === "medium";
  const container = widget.addStack();
  if (sideBySide) container.layoutHorizontally();
  else container.layoutVertically();

  let rest = 0;
  cafeterias.forEach((c, i) => {
    if (i > 0) {
      if (sideBySide) {
        container.addSpacer(14);
      } else {
        container.addSpacer(6);
        addDivider(container);
        container.addSpacer(6);
      }
    }
    rest += addCafeteria(container, c, now, layout, maxRows, multi ? targetDef.short[c.id] : null, sharedDate);
  });
  widget.addSpacer();
  addFooter(widget, cafeterias, rest, family, layout);
  return widget;
}

const family = config.runsInWidget ? config.widgetFamily : TEST_FAMILY;
const target = (config.runsInWidget ? args.widgetParameter : TEST_TARGET)?.trim() || DEFAULT_TARGET;
const widget = await createWidget(family, target);
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  const present = { small: "presentSmall", medium: "presentMedium", large: "presentLarge", extraLarge: "presentExtraLarge" };
  await widget[present[family] ?? "presentMedium"]();
}
Script.complete();
