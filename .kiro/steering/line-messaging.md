---
inclusion: always
---

# LINE 配信の安全ルール

LINE の配信は取り消せない。本プロジェクトが使う LINE 公式アカウントは本番の1つだけで、友だちは実際のお客様。テスト用アカウントは作らない。

## 友だち全員への配信

- 友だち全員への配信（broadcast、multicast、narrowcast）は、本番スタックの前日配信の Lambda だけが行う。エージェントからは行わない
- LINE Bot MCP Server の broadcast 系のツールは、hook（`.kiro/harness/hooks/line-send-check.sh`）が止める
- 前日配信の関数を手で動かさない。`sam local invoke`、`sam local start-lambda`、`sam remote invoke`、`aws lambda invoke`、Power の `sam_local_invoke` は hook が止める。本番のトークンで友だち全員に配信されるため
- テスト用スタックは、配信を無効（`NotifyEnabled=false`）のままにする。配信を有効にするのは本番スタックだけで、依頼者の指示を受けてから

## 試験送信

- 試験送信は、依頼者宛ての push だけで行う。依頼者が試験送信を指示したときだけ送る
- 宛先は MCP サーバーの既定の宛先（SSM の `/tanakaya/prod/line-destination-user-id`）にする。`userId` を指定しない。`userId` 付きの push は hook が止める
- LINE Bot MCP Server は `line-tester` エージェントだけが使う。使えるツールは `push_text_message`、`push_flex_message`、`get_message_quota` だけ
- 送る前に、文面を依頼者に示す。文面の先頭に「【試験送信】」を付ける
- 送信がタイムアウトしても再送しない。状況を依頼者に報告して判断を待つ

## 通数とトークン

- 無料プランの上限は月200通。push も1通と数え、前日配信は1回で友だちの人数分を数える。送る前に `get_message_quota` で、その月の残りを確かめる
- トークンと宛先のユーザー ID は SSM の SecureString にだけ置く（`/tanakaya/prod/line-channel-access-token`、`/tanakaya/prod/line-destination-user-id`）
- LINE Bot MCP Server は、起動時に SSM から2つを読んで環境変数で渡す（`.kiro/agents/line-tester.md`）。ファイルに書かない
- トークンとユーザー ID をチャットに貼らない。ファイル、ログ、コミットに書かない
