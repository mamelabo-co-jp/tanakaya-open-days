---
inclusion: always
---

# Git 規約

## ブランチと PR

- `main` に直接コミット、push しない
- 作業ごとにブランチを作る：`feature/<短い説明>`、`fix/<短い説明>`、`docs/<短い説明>`、`chore/<短い説明>`
- ブランチを push し、`gh pr create` で `main` 向けの PR を作る。本文には、やったこと、やらなかったこと、確かめたことを書く
- マージは依頼者の指示を受けてから、`gh pr merge --merge --delete-branch` で行う（コミットの履歴を残す）
- force push と、push 済みの履歴の書き換えはしない

## 提出後の凍結

- 2026-10-06 15:59（日本時間）の提出後、審査完了（2026-10-19 23:59 PT）か受賞メールの受信まで、commit、push、PR のマージをしない
- 凍結中に休業日を変えるときは、git で管理しない `data/settings.json` を書き換えてデプロイする

## コミットメッセージ

Conventional Commits に従う。

```
<type>(<scope>): <description>
```

type は `feat`、`fix`、`docs`、`style`、`refactor`、`test`、`chore` のいずれか。

## コミットの作成者

- メールはリポジトリの設定にある noreply（`44718552+mamezou@users.noreply.github.com`）を使う
- git config を変えない
