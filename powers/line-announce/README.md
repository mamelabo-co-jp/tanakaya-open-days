# line-announce（Kiro Power）

LINE 公式アカウントの告知を安全に扱うための Kiro Power です。[Agent Plugins](https://agent-plugins.org/) の形式（`plugin.json`、`mcp.json`、`skills/`）で作っています。

| ファイル | 内容 |
|---|---|
| `plugin.json` | Power の名前、説明、有効になるキーワード |
| `mcp.json` | LINE Bot MCP Server（`@line/line-bot-mcp-server@0.5.0`）の接続。起動のたびに SSM の SecureString からトークンと宛先を読み、環境変数で渡す |
| `skills/safe-announce/SKILL.md` | 安全な配信手順：通数の確認 → 文面の確認 → 依頼者宛ての試験送信 → 本番の告知はアプリか手動で |

## 使う前に

1. LINE 公式アカウントのチャネルアクセストークン（長期）と、宛先にする自分のユーザー ID を、SSM の SecureString に登録する
2. `aws sso login` で AWS にログインする
3. Kiro の Powers パネルで **Add Custom Power** → **Import power from a folder** を選び、このフォルダーを指定する

パラメータの名前とプロファイルは、環境変数 `LINE_TOKEN_PARAMETER`、`LINE_DESTINATION_PARAMETER`、`AWS_PROFILE`、`AWS_REGION` で変えられます。

## 注意

- この Power の MCP サーバーには broadcast 系のツールもあります。本リポジトリでは `.kiro/harness/hooks/line-send-check.sh` が、broadcast 系のツールと `userId` 付きの push を止めます。ほかのプロジェクトで使うときも、同じ制限を用意してください
- `@line/line-bot-mcp-server@0.5.0` の依存パッケージには、`npm audit` で high の指摘が11件あります（puppeteer、@xmldom/xmldom など。2026-10-06 時点）
