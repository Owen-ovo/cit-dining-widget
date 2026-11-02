"""週間メニュー PDF の表を、文字の座標から読み取る。

PDF は Excel から書き出されたもので、文字データと罫線を持っている。
罫線からセルを求め、各語をその中心が入るセルに割り当てる。
セルからはみ出して描かれた語も、中心の位置で正しいセルに入る。
"""

import io
import re
import unicodedata
from dataclasses import dataclass, field

import pdfplumber

DATE_RE = re.compile(r"(?:(\d{1,2})月)?(\d{1,2})日")
# ¥350 / ￥350 / <工大400> / \350（ラーメン\350 のような表記）
PRICE_RE = re.compile(r"[¥\\]\s*(\d{2,4})|<工大(\d{2,4})>")
TIME_RE = re.compile(r"\d{1,2}\s*[:：]\s*\d{2}")
NOTICE_WORDS = ("ありません", "都合により", "変更する")


@dataclass
class Cell:
    x0: float
    top: float
    x1: float
    bottom: float
    words: list = field(default_factory=list)

    def lines(self) -> list[str]:
        """セル内の語を行ごとにまとめた文字列のリスト（上から順）"""
        rows: list[list[dict]] = []
        for w in sorted(self.words, key=lambda w: (w["top"], w["x0"])):
            if rows and abs(rows[-1][0]["top"] - w["top"]) < w["size"] * 0.5:
                rows[-1].append(w)
            else:
                rows.append([w])
        lines = [normalize(" ".join(w["text"] for w in sorted(row, key=lambda w: w["x0"]))) for row in rows]
        return [line for line in lines if line]


def normalize(text: str) -> str:
    # 全角英数字・半角カナ・全角記号をそろえる（ｿｰｽ→ソース、＜→<、１→1）
    text = unicodedata.normalize("NFKC", text).replace("~", "〜")
    return re.sub(r"\s+", " ", text).strip()


def center(obj) -> tuple[float, float]:
    return (obj["x0"] + obj["x1"]) / 2, (obj["top"] + obj["bottom"]) / 2


def find_dates(page) -> list[tuple[float, int | None, int]]:
    """見出しの日付を (x 座標, 月, 日) で返す。月は最初の日付にしか書かれていない"""
    dates = []
    for w in page.extract_words(x_tolerance=1.5):
        m = DATE_RE.search(normalize(w["text"]))
        if m:
            dates.append((center(w)[0], int(m[1]) if m[1] else None, int(m[2])))
    return sorted(dates)


def split_items(lines: list[str], default_price: int | None) -> list[dict]:
    """1 つのセルの行を料理ごとに分ける。値段の行が料理の区切りになる"""
    price_first = bool(lines) and PRICE_RE.fullmatch(lines[0]) is not None
    items: list[dict] = []
    name: list[str] = []
    price = default_price
    note = None

    def flush():
        nonlocal name, price, note
        if name:
            items.append({"name": " ".join(name), "price": price, "note": note})
        name, price, note = [], default_price, None

    for line in lines:
        m = PRICE_RE.search(line)
        rest = PRICE_RE.sub("", line).strip()
        if any(w in line for w in NOTICE_WORDS):
            if items or name:
                note = line
                if not name:
                    items[-1]["note"] = line
            continue
        if m:
            value = int(m[1] or m[2])
            if price_first:
                flush()
                price = value
            else:
                price = value
                if rest:
                    name.append(rest)
                flush()
                continue
        if rest:
            name.append(rest)
    flush()
    return items


KINDS = ("ラーメン", "カレー", "サラダ", "パスタ")


def with_kind(item: dict, category: str) -> dict:
    """「塩」「焼肉」だけでは分からないので、見出しの種類（ラーメン、カレーなど）を足す"""
    kind = next((k for k in KINDS if category.endswith(k)), None)
    if kind and kind not in item["name"]:
        return {**item, "name": f"{item['name']} {kind}"}
    return item


def parse_common(lines: list[str]) -> list[dict]:
    """「ライス¥100 きんぴら¥50」のような全日共通の行を品目に分ける"""
    text = " ".join(lines)
    return [
        {"name": m[1].strip(), "price": int(m[2])}
        for m in re.finditer(r"([^\s¥\\]+?)\s*[¥\\]\s*(\d{2,4})", text)
    ]


def parse_pdf(data: bytes) -> dict:
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        page = pdf.pages[0]
        table = page.find_tables()[0]
        cells = [Cell(*bbox) for bbox in dict.fromkeys(table.cells)]
        # use_text_flow: 重なって描かれた別の文字列（見出しにかぶる料理名など）を混ぜない
        for w in page.extract_words(x_tolerance=1.5, use_text_flow=True, extra_attrs=["size"]):
            cx, cy = center(w)
            for cell in cells:
                if cell.x0 <= cx < cell.x1 and cell.top <= cy < cell.bottom:
                    cell.words.append(w)
                    break
        dates = find_dates(page)

    # 日付の列ごとの x 座標と、月をまたぐ日付の補完
    columns = []
    month = None
    for x, m, d in dates:
        if m:
            month = m
        elif columns and d < columns[-1][2]:
            month = month % 12 + 1
        columns.append((x, month, d))
    first_x = columns[0][0]

    def covered_columns(cell: Cell) -> list[int]:
        return [i for i, (x, _, _) in enumerate(columns) if cell.x0 <= x < cell.x1]

    labels = [c for c in cells if c.x1 <= first_x + 1]

    def label_lines_of(cell: Cell) -> tuple[list[str], bool]:
        """データのセルと縦に重なる見出しセルの行と、上の行の続きかどうか。

        見出しは「今日のパスタ」「¥300」のように複数のセルに分かれていることがある。
        値段だけの小さな見出しセルは、すぐ上の見出しセルの続きとして扱う。
        """
        found = sorted(
            (l for l in labels if l.top < cell.bottom - 2 and cell.top + 2 < l.bottom),
            key=lambda l: l.top,
        )
        lines = [line for l in found for line in l.lines()]
        if found and all(PRICE_RE.fullmatch(l) for l in lines) and found[0].bottom - found[0].top < 25:
            above = next((l for l in labels if abs(l.bottom - found[0].top) < 2), None)
            if above and any(not PRICE_RE.fullmatch(l) for l in above.lines()):
                return above.lines() + lines, True
        return lines, False

    days = [{"month": m, "day": d, "note": None, "items": []} for _, m, d in columns]
    common: list[dict] = []
    for cell in sorted(cells, key=lambda c: (c.top, c.x0)):
        idx = covered_columns(cell)
        lines = cell.lines()
        if not idx or not lines:
            continue
        label_lines, continued = label_lines_of(cell)
        if any(DATE_RE.search(l) for l in lines):
            continue
        # 曜日すべてにまたがるセルは定番・単品などの共通メニュー
        if len(idx) >= len(columns) - 1 and len(idx) > 1:
            common += parse_common(label_lines[1:] + lines if label_lines else lines)
            continue
        if not label_lines or not any(PRICE_RE.search(l) or not TIME_RE.search(l) for l in label_lines):
            # 見出しのない行は祝日名などの注記だけ拾う
            for i in idx:
                for line in lines:
                    if line.endswith("の日") or "休" in line:
                        days[i]["note"] = line
            continue
        prices = [int(m[1] or m[2]) for l in label_lines for m in PRICE_RE.finditer(l)]
        category = next(
            (
                PRICE_RE.sub("", l).strip()
                for l in label_lines
                if PRICE_RE.sub("", l).strip() and not TIME_RE.search(l) and "営業" not in l and "ご飯" not in l
            ),
            "定食" if any("ご飯" in l for l in label_lines) else "",
        )
        if not any(PRICE_RE.search(l) for l in lines) and all(
            TIME_RE.search(l) or "営業" in l for l in lines
        ):
            for i in idx:
                days[i]["note"] = " ".join(lines)
            continue
        has_price = any(PRICE_RE.search(l) for l in lines)
        items = split_items(lines, prices[0] if prices else None)
        for i in idx:
            for item in items:
                prev = days[i]["items"][-1] if days[i]["items"] else None
                # 「ハンバーグ」「&コロッケ」のように 2 つのセルに分かれて描かれた料理をつなぐ
                if prev and (item["name"].startswith("&") or (continued and not has_price and prev["category"] == category)):
                    prev["name"] += " " + item["name"]
                    prev["price"] = prev["price"] or item["price"]
                else:
                    days[i]["items"].append({"category": category, **item})

    for day in days:
        day["items"] = [with_kind(item, item["category"]) for item in day["items"]]
    return {"days": days, "common": common}
