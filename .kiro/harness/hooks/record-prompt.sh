#!/bin/bash
# 依頼者の最後の入力を記録する (UserPromptSubmit)
#
# Kiro の hook 入力には会話履歴 (transcript) が無いため、承認の文字列とバイパスの文字列の
# 判定に使う「依頼者の最後の入力」を、この hook が state/ に書き残す。
#   state/prompt-<session>.txt  その session の最後の入力
#   state/prompt-default.txt    session を問わない最後の入力 (session_id が無い入力用)
# 入力本文は環境変数 USER_PROMPT (IDE) か、標準入力 JSON の .prompt (CLI) から取る。
# 本文が取れないときも空で上書きする (古い承認の文字列を残さないため)。
# 最後の 1 件だけを残し、履歴は持たない。state/ は .gitignore で除外する。
# 何があってもプロンプトは止めない (常に exit 0、標準出力には何も出さない)。

set -uo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/config.sh"

input=$(cat 2>/dev/null || true)
command -v jq >/dev/null 2>&1 || exit 0

prompt="${USER_PROMPT:-}"
if [[ -z "$prompt" ]]; then
  prompt=$(printf '%s' "$input" | jq -r '.prompt // .user_prompt // empty' 2>/dev/null || true)
fi

key=$(harness_session_key "$input")
mkdir -p "$HARNESS_STATE_DIR" 2>/dev/null || exit 0
chmod 700 "$HARNESS_STATE_DIR" 2>/dev/null || true
umask 077
printf '%s\n' "$prompt" > "$HARNESS_STATE_DIR/prompt-${key}.txt" 2>/dev/null || true
if [[ "$key" != "default" ]]; then
  printf '%s\n' "$prompt" > "$HARNESS_STATE_DIR/prompt-default.txt" 2>/dev/null || true
fi
exit 0
