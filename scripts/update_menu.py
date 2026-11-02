"""cit-s.com の学食メニュー PDF を取得し、表を読み取って data/menu.json に書き出す。

内容が前回と同じなら data/menu.json は書き換えない。
"""

import json
import sys
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from parse_menu import parse_pdf

JST = timezone(timedelta(hours=9))
BASE = "https://www.cit-s.com/wp/wp-content/themes/cit/syokudo"
CAFETERIAS = [
    {"id": "tsudanuma", "name": "津田沼", "url": f"{BASE}/t.pdf"},
    {"id": "shin1", "name": "新習志野 1F", "url": f"{BASE}/s1.pdf"},
    {"id": "shin2", "name": "新習志野 2F", "url": f"{BASE}/s2.pdf"},
]
OUT = Path(__file__).resolve().parent.parent / "data" / "menu.json"


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "cit-dining-widget"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def to_date(month: int, day: int, today: date) -> date:
    # PDF には年がないので、取得日に一番近い年を選ぶ（年末年始のまたぎ対策）
    candidates = [date(today.year + dy, month, day) for dy in (-1, 0, 1)]
    return min(candidates, key=lambda d: abs((d - today).days))


def build_entry(cafeteria: dict, menu: dict, today: date) -> dict:
    return {
        **cafeteria,
        "days": [
            {
                "date": to_date(d["month"], d["day"], today).isoformat(),
                "note": d["note"],
                "items": d["items"],
            }
            for d in menu["days"]
        ],
        "common": menu["common"],
    }


def main() -> int:
    now = datetime.now(JST)
    cafeterias = []
    for cafeteria in CAFETERIAS:
        menu = parse_pdf(fetch(cafeteria["url"]))
        entry = build_entry(cafeteria, menu, now.date())
        print(f"{cafeteria['name']}: {entry['days'][0]['date']} から {len(entry['days'])} 日分")
        cafeterias.append(entry)

    if OUT.exists() and json.loads(OUT.read_text())["cafeterias"] == cafeterias:
        print("変更なし")
        return 0

    OUT.parent.mkdir(exist_ok=True)
    data = {"updated_at": now.isoformat(timespec="seconds"), "cafeterias": cafeterias}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"{OUT} を更新しました")
    return 0


if __name__ == "__main__":
    sys.exit(main())
