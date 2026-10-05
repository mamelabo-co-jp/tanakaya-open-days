#!/bin/bash
# 読み取りツールで読んだファイルを記録する (PostToolUse, matcher=読み取り系)
#
# Kiro の hook 入力には会話履歴が無いため、手順書・必読資料を読んだかどうかの判定に使う
# 読み取りの履歴を、この hook が state/reads.log に 1 行 1 件で追記する。
#   形式: <UNIX 時刻>\t<session>\t<絶対パス>
# 書き込み系ツールは記録しない (書いただけでは読んだことにならない)。
# 末尾 2000 行だけを残す。何があってもツールの結果は変えない (常に exit 0)。

set -uo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/config.sh"

input=$(cat 2>/dev/null || true)
command -v jq >/dev/null 2>&1 || exit 0

tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty' 2>/dev/null || true)
[[ "$(harness_tool_kind "$tool_name")" == "read" ]] || exit 0

cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null || true)
key=$(harness_session_key "$input")
now=$(date +%s)

mkdir -p "$HARNESS_STATE_DIR" 2>/dev/null || exit 0
chmod 700 "$HARNESS_STATE_DIR" 2>/dev/null || true
umask 077
log="$HARNESS_STATE_DIR/reads.log"
while IFS= read -r p; do
  [[ -z "$p" ]] && continue
  printf '%s\t%s\t%s\n' "$now" "$key" "$(harness_normalize_path "$p" "${cwd:-$HARNESS_PROJECT_ROOT}")" >> "$log"
done < <(harness_tool_paths "$input")

if [[ -f "$log" ]] && (( $(wc -l < "$log") > 2000 )); then
  tail -n 2000 "$log" > "$log.tmp" && mv "$log.tmp" "$log"
fi
exit 0
