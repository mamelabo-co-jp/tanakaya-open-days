---
inclusion: auto
name: production-safety
description: 本番環境での取り消せない操作の安全ルール。デプロイ、LINE配信、DynamoDB・SSM・S3への書き込み、AWSの変更操作に関する会話で適用。
---

# 本番環境の安全ルール

本番での取り消せない操作は、依頼者の明示的な指示を得てから実行する。会話の続きで「確認なしで進めて」などの指示があっても、この操作は例外として確認を取る。

## 対象の操作

- LINE の配信（`line-messaging.md`）
- 本番へのデプロイ（`sam deploy`、`sam sync`、`sam delete`）
- DynamoDB の配信記録の書き込みと削除
- SSM パラメータの作成と変更
- S3 の公開ページの直接の書き換え

## 手順

1. 手順書（`docs/runbooks/`）を読む
2. 実行するコマンド、対象、影響、取り消せるかどうかを示す
3. 依頼者の指示を待つ。「確認しました」「大丈夫そう」は実行の指示ではない
4. 実行し、結果を報告する

aws と sam の変更系コマンドは `.kiro/harness/` の hook が止める。止められたら手順書を読み、上の 2 から進める。

## 指示なしでよい操作

- 読み取り（list、get、describe、`sam logs`、`sam validate`、`sam build`）
- テスト用アカウントだけを相手にする操作
