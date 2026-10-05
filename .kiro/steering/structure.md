---
inclusion: always
---

# プロジェクト構造

## ディレクトリ構成

```
tanakaya-open-days/
├── src/
│   ├── calendar/          # 営業日の判定（純粋関数）
│   ├── settings/          # 設定ファイルの読み込みと検証
│   ├── publish/           # 設定ファイルから公開用データを作る
│   └── notify/            # 前日配信の Lambda（LINE、DynamoDB、SSM を使う）
├── public/                # 公開ページ（静的な HTML、CSS、JS）
├── data/
│   └── settings.example.json   # 見本。実ファイルの settings.json は git で管理しない
├── template.yaml          # AWS SAM
├── docs/
│   ├── plan.md            # 計画の正本
│   └── runbooks/          # デプロイなど、クラウドを変える操作の手順書
├── powers/line-announce/  # 自作の Power
└── .kiro/                 # steering、specs、hooks、agents、harness（hook の本体）
```

Spec の design で構成を変えたときは、このファイルも合わせて直す。

## 配置と命名

- テストは対象と同じディレクトリに置く。単体テストは `<対象>.test.ts`、プロパティベーステストは `<対象>.property.test.ts`
- ファイル名は camelCase。型は PascalCase、定数は UPPER_SNAKE_CASE
- 外部サービス（LINE、DynamoDB、SSM）を呼ぶコードは `src/notify/` に置く。`src/calendar/` と `src/publish/` からは呼ばない
