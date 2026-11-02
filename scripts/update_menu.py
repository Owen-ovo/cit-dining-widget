"""cit-s.com の学食メニュー PDF を取得し、Claude で読み取って data/menu.json に書き出す。

PDF のハッシュが前回と同じ食堂は API を呼ばずに前回の結果を使う。
"""

import base64
import hashlib
import json
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import anthropic
from pydantic import BaseModel

JST = timezone(timedelta(hours=9))
BASE = "https://www.cit-s.com/wp/wp-content/themes/cit/syokudo"
CAFETERIAS = [
    {"id": "tsudanuma", "name": "津田沼", "url": f"{BASE}/t.pdf"},
    {"id": "shin1", "name": "新習志野 1F", "url": f"{BASE}/s1.pdf"},
    {"id": "shin2", "name": "新習志野 2F", "url": f"{BASE}/s2.pdf"},
]
OUT = Path(__file__).resolve().parent.parent / "data" / "menu.json"
MODEL = "claude-opus-5-5"

PROMPT = """これは大学の学生食堂の週間メニュー表です。表を読み取り、日ごとのメニューを抽出してください。

- days には表に列がある日をすべて入れる。month と day は列見出しの日付。
- 料理はないが「営業中」や営業時間だけが書かれた日は closed を false、items を空にし、その記載を note に書く。
- 列が空欄、または「休業」と書かれた日は closed を true にし、items は空にする。理由があれば note に書く。
- 祝日名（例: 文化の日）が書かれていても、料理が載っていれば営業日として扱い、祝日名を note に書く。
- items には、その日に食べられる料理を 1 品ずつ入れる。
  - category は表の行見出し（例: 朝定食, 定食, 丼, カレー, 麺, パスタ, お弁当, 夕定食）。行見出しが値段だけの行は、料理から推測した短い分類名にする。
  - name は料理名。セル内で改行されていても 1 つの料理なら 1 つにまとめる。「&」「＆」でつながる付け合わせは name に含める。
  - price は円の整数。セルに値段があればそれを、なければ行見出しの値段を使う。「工大400」のような表記も 400 とする。不明なら null。
  - 「販売ありません」「大盛販売ありません」などの注意書きは料理ではないので、該当料理の note に入れるか無視する。
- 全日共通の定番・単品・小鉢は common に入れる（name と price）。
- hours には営業時間の記載を 1 行にまとめて入れる。
- 半角カナは全角カナに直す。"""


class Item(BaseModel):
    category: str
    name: str
    price: int | None
    note: str | None


class Day(BaseModel):
    month: int
    day: int
    closed: bool
    note: str | None
    items: list[Item]


class CommonItem(BaseModel):
    name: str
    price: int | None


class Menu(BaseModel):
    hours: str
    days: list[Day]
    common: list[CommonItem]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "cit-dining-widget"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def to_date(month: int, day: int, today: date) -> date:
    # PDF には年がないので、取得日に一番近い年を選ぶ（年末年始のまたぎ対策）
    candidates = [date(today.year + dy, month, day) for dy in (-1, 0, 1)]
    return min(candidates, key=lambda d: abs((d - today).days))


def extract(client: anthropic.Anthropic, pdf: bytes) -> Menu:
    response = client.messages.parse(
        model=MODEL,
        max_tokens=16000,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "document",
                    "source": {
                        "type": "base64",
                        "media_type": "application/pdf",
                        "data": base64.standard_b64encode(pdf).decode(),
                    },
                },
                {"type": "text", "text": PROMPT},
            ],
        }],
        output_format=Menu,
    )
    if response.stop_reason != "end_turn" or response.parsed_output is None:
        raise RuntimeError(f"読み取りに失敗しました: stop_reason={response.stop_reason}")
    return response.parsed_output


def build_entry(cafeteria: dict, sha256: str, menu: Menu, today: date) -> dict:
    return {
        **cafeteria,
        "sha256": sha256,
        "hours": menu.hours,
        "days": [
            {
                "date": to_date(d.month, d.day, today).isoformat(),
                "closed": d.closed,
                "note": d.note,
                "items": [i.model_dump() for i in d.items],
            }
            for d in menu.days
        ],
        "common": [c.model_dump() for c in menu.common],
    }


def main() -> int:
    now = datetime.now(JST)
    previous = {}
    if OUT.exists():
        previous = {c["id"]: c for c in json.loads(OUT.read_text())["cafeterias"]}

    client = None
    cafeterias = []
    for cafeteria in CAFETERIAS:
        pdf = fetch(cafeteria["url"])
        sha256 = hashlib.sha256(pdf).hexdigest()
        old = previous.get(cafeteria["id"])
        if old and old["sha256"] == sha256:
            print(f"{cafeteria['name']}: 変更なし")
            cafeterias.append(old)
            continue
        print(f"{cafeteria['name']}: 読み取り中")
        client = client or anthropic.Anthropic()
        menu = extract(client, pdf)
        cafeterias.append(build_entry(cafeteria, sha256, menu, now.date()))

    if all(previous.get(c["id"]) is c for c in cafeterias):
        return 0

    OUT.parent.mkdir(exist_ok=True)
    data = {"updated_at": now.isoformat(timespec="seconds"), "cafeterias": cafeterias}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"{OUT} を更新しました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
