# cit-dining-widget

千葉工業大学の学食メニュー（津田沼・新習志野 1F・新習志野 2F）を iPhone のホーム画面に表示する [Scriptable](https://apps.apple.com/jp/app/scriptable/id1405459188) ウィジェットです。

メニューは [CIT サービスの学生食堂ページ](https://www.cit-s.com/dining/) で公開されている週間メニュー PDF から取得します。

## 仕組み

1. GitHub Actions が毎日 7:00 と 12:00（JST）に 3 つの PDF をダウンロードする。
2. PDF の罫線と文字の位置から表を読み取り（[`scripts/parse_menu.py`](scripts/parse_menu.py)）、内容が変わっていれば `data/menu.json` を更新・コミットする。
3. ウィジェットは `data/menu.json` を読み込んで、今日のメニューを表示する。

PDF は文字データを持っているので OCR や外部の API は使いません。GitHub Actions だけで動き、費用はかかりません。

ウィジェット側は JSON を読むだけなので、メニューが変わってもスクリプトを入れ直す必要はありません。

## ウィジェットの使い方

1. App Store から Scriptable をインストールする。
2. iPhone で [`widget/cit_dining.js`](widget/cit_dining.js) を開き、Raw 表示の内容を Scriptable の新規スクリプトに貼り付ける。
3. ホーム画面を長押しして Scriptable のウィジェットを追加し、長押し →「ウィジェットを編集」で次のように設定する。
   - スクリプト: 保存したスクリプト
   - パラメータ: 表示する食堂

| パラメータ | 表示 |
|---|---|
| `tsudanuma` | 津田沼 |
| `shin1` | 新習志野 1F |
| `shin2` | 新習志野 2F |
| `shin` | 新習志野 1F と 2F |
| 空欄 | `DEFAULT_TARGET`（初期値は津田沼） |

### 表示のルール

- 料理は「定食・丼・麺・カレー・パスタ…」の分類ごとにまとめて表示します。行が足りないときは、どの分類があるかが分かるよう各分類から 1 品ずつ選び、残りは「ほか○品」と表示します。
- 見出しの「今日」「明日」バッジで、いつのメニューかを示します。
- `shin` では「新習志野」と日付を 1 回だけ出し、1F と 2F を並べます（medium は左右、small・large は上下）。
- large で 1 つの食堂を表示するときは、下に定番メニューを出します。
- 20:00 を過ぎると翌日のメニューを表示します。
- 10:00 を過ぎると、その日の朝定食は表示しません。
- メニュー表にない日（日曜など）は、次にメニューがある日を表示します。
- 通信できないときは、前回取得したデータを表示します。
- ウィジェットをタップすると学生食堂のページが開きます。

### 設定（スクリプト冒頭）

| 名前 | 内容 |
|---|---|
| `DEFAULT_TARGET` | パラメータが空欄のときの食堂 |
| `SWITCH_TO_TOMORROW_HOUR` | 翌日のメニューに切り替える時刻 |
| `BREAKFAST_END_HOUR` | 今日の朝定食を表示しなくなる時刻 |
| `WIDGET_BG_COLOR` / `CAFETERIA_COLOR` | 背景色と食堂ごとの色 |
| `LAYOUT` | サイズごとの余白・文字サイズ・表示品数 |
| `TEST_FAMILY` / `TEST_TARGET` | Scriptable 内で実行したときのプレビュー |

## 自動更新

GitHub Actions の `update-menu` が自動で動くので、設定は不要です。すぐに更新したいときは Actions タブの `update-menu` → Run workflow で実行します。

ローカルで実行する場合:

```bash
pip install -r requirements.txt
python scripts/update_menu.py
```

## 注意

- メニューは食堂の都合で変わることがあります。正確な情報は食堂の掲示や公式ページで確認してください。
- 表の形が変わると読み取りを誤ることがあります。おかしな表示に気づいたら Issue で知らせてください。
- 非公式のプロジェクトです。株式会社シー・アイ・ティ・サービスとは関係ありません。
