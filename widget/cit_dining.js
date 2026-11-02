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
const TEXT_COLOR = "#FFFFFF";
const SUB_TEXT_COLOR = "#9AA4B8";
const CAFETERIA_COLOR = {
  tsudanuma: "#1E3A8A",
  shin1: "#065F46",
  shin2: "#9A3412",
};

const LAYOUT = {
  small: { padding: 12, cornerRadius: 8, fontSize: { title: 13, date: 11, item: 12, price: 11 }, maxItems: 4 },
  medium: { padding: 14, cornerRadius: 10, fontSize: { title: 15, date: 12, item: 13, price: 12 }, maxItems: 5 },
  large: { padding: 16, cornerRadius: 12, fontSize: { title: 17, date: 13, item: 14, price: 13 }, maxItems: 12 },
  extraLarge: { padding: 18, cornerRadius: 12, fontSize: { title: 18, date: 14, item: 15, price: 14 }, maxItems: 12 },
};

// Scriptable 内で実行したときのプレビューサイズとパラメータ
const TEST_FAMILY = "medium";
const TEST_TARGET = "shin";
// ===== 設定ここまで =====

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const TARGETS = {
  tsudanuma: ["tsudanuma"],
  shin1: ["shin1"],
  shin2: ["shin2"],
  shin: ["shin1", "shin2"],
};

function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${wd})`;
}

// 表示したい日以降で、メニュー表にある最初の日を返す。表にない日（日曜など）は次の営業日になる
function pickDay(cafeteria, now) {
  const target = new Date(now);
  if (now.getHours() >= SWITCH_TO_TOMORROW_HOUR) target.setDate(target.getDate() + 1);
  const targetIso = isoDate(target);
  const days = [...cafeteria.days].sort((a, b) => a.date.localeCompare(b.date));
  return days.find((d) => d.date >= targetIso) ?? null;
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

function addText(stack, text, size, color, bold = false) {
  const t = stack.addText(text);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = new Color(color);
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.7;
  return t;
}

function addCafeteria(stack, cafeteria, now, layout, maxItems) {
  const card = stack.addStack();
  card.layoutVertically();
  card.setPadding(6, 8, 6, 8);
  card.cornerRadius = layout.cornerRadius;
  card.backgroundColor = new Color(CAFETERIA_COLOR[cafeteria.id] ?? "#333333", 0.35);

  const day = pickDay(cafeteria, now);
  const header = card.addStack();
  header.centerAlignContent();
  addText(header, cafeteria.name, layout.fontSize.title, TEXT_COLOR, true);
  header.addSpacer();
  if (day) addText(header, formatDate(day.date), layout.fontSize.date, SUB_TEXT_COLOR);
  card.addSpacer(3);

  if (!day) {
    addText(card, "メニュー未掲載", layout.fontSize.item, SUB_TEXT_COLOR);
    return;
  }

  if (day.items.length === 0) {
    addText(card, day.note || "日替わりメニューなし", layout.fontSize.item, SUB_TEXT_COLOR);
    return;
  }

  // 今日の分を朝食の時間帯より後に表示するときは朝定食を省く
  const pastBreakfast = day.date === isoDate(now) && now.getHours() >= BREAKFAST_END_HOUR;
  const available = day.items.filter((i) => !(pastBreakfast && i.category.includes("朝")));
  const items = available.slice(0, maxItems);
  for (const item of items) {
    const row = card.addStack();
    row.centerAlignContent();
    addText(row, item.name, layout.fontSize.item, TEXT_COLOR);
    row.addSpacer();
    if (item.price != null) addText(row, `¥${item.price}`, layout.fontSize.price, SUB_TEXT_COLOR);
  }
  const rest = available.length - items.length;
  if (rest > 0) addText(card, `ほか${rest}品`, layout.fontSize.price, SUB_TEXT_COLOR);
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
    addText(widget, "メニューを取得できませんでした", layout.fontSize.item, SUB_TEXT_COLOR);
    return widget;
  }

  const ids = TARGETS[targetKey] ?? TARGETS[DEFAULT_TARGET];
  const cafeterias = ids.map((id) => data.cafeterias.find((c) => c.id === id)).filter(Boolean);
  // 2 つ並べるときは 1 つあたりの品数を減らす
  const maxItems = Math.max(1, Math.floor(layout.maxItems / cafeterias.length));
  const isWide = family !== "small" && cafeterias.length > 1;
  const container = widget.addStack();
  if (isWide) container.layoutHorizontally();
  else container.layoutVertically();
  cafeterias.forEach((c, i) => {
    if (i > 0) container.addSpacer(6);
    addCafeteria(container, c, now, layout, isWide ? layout.maxItems : maxItems);
  });
  widget.addSpacer();
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
