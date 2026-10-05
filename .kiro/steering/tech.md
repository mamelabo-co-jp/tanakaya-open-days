---
inclusion: always
---

# 技術スタック

## 言語・ランタイム

- TypeScript（`strict: true`）
- Node.js 24.x。Lambda のランタイムは `nodejs24.x`（20.x は Lambda で 2026-04-30 にサポートが終わっている）
- npm。`package-lock.json` をコミットする

## AWS の構成

AWS SAM（`template.yaml`）で書き、東京リージョン（ap-northeast-1）にデプロイする。

| 用途 | サービス |
|---|---|
| 公開ページ | Amazon S3 と Amazon CloudFront（既定ドメイン） |
| 前日配信の起動 | Amazon EventBridge Scheduler |
| 前日配信の処理 | AWS Lambda |
| 配信記録（二重配信の防止） | Amazon DynamoDB |
| LINE のチャネルアクセストークン | AWS Systems Manager Parameter Store（SecureString） |

使わないもの：API Gateway、Cognito、React、Next.js、AWS CDK

## 日付の扱い

- 日付は日本時間の暦日として、`YYYY-MM-DD` の文字列で扱う
- 実行環境のタイムゾーンに頼らない。Lambda の既定は UTC
- 現在時刻は引数で受け取り、判定関数を純粋関数にする（テストで時刻を固定するため）

## 秘密情報の置き場所

- LINE のトークンは SSM の SecureString にだけ置く。コード、設定ファイル、ログ、公開用データに書かない
- 開発用の LINE Bot MCP Server のトークンは環境変数で渡し、ファイルに書かない
- `.env` と `data/settings.json` は `.gitignore` で除外している

## テストと品質

- Vitest と fast-check。方針は `testing.md`
- ESLint（flat config）と Prettier
