#!/bin/bash
# 指定したファイルの編集前に、関連資料の読み取りを求める (PreToolUse, matcher=書き込み系)
# 元: mamezou/mamezou-claude-plugins の plugins/harness-ja/hooks/require-reading.sh (MIT)
#
# Claude Code 版からの変更点:
#   - transcript の代わりに record-read.sh の記録 (readWindowMinutes 以内) を使う
#   - 作業ログの特例 (mode: "logs") は、本プロジェクトに作業ログが無いため削った
#
# 発火条件: 編集対象の絶対パスが requireReading.rules[].target (bash の case パターン) に一致
#           配列順に照合し、最初に一致した要素を使う
# 通過条件: requiredReadPattern (grep -E) に一致するファイルを直近で読み取った
# バイパス: 依頼者の最後の入力に [hook-bypass: resource-reading] がそれだけの行としてある
#
# 設定 (.kiro/harness/config.json):
#   requireReading.enabled  false で無効化
#   requireReading.rules[]  target / requiredReadPattern / hint

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/config.sh"

input=$(cat)
if ! command -v jq >/dev/null 2>&1; then
  echo "[harness] jq が無いため require-reading を実行できません" >&2
  exit 1
fi
harness_load_config "$input"
harness_config_guard pre
cfg_enabled '.requireReading' || exit 0

rule_count=$(cfg '.requireReading.rules | length' '0')
[[ "${rule_count:-0}" -gt 0 ]] || exit 0

tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')
[[ "$(harness_tool_kind "$tool_name")" == "write" ]] || exit 0
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')

file_path=""; related_pattern=""; target_name=""
while IFS= read -r candidate; do
  [[ -z "$candidate" ]] && continue
  abs=$(harness_normalize_path "$candidate" "${cwd:-$HARNESS_PROJECT_ROOT}")
  while IFS= read -r rule; do
    [[ -z "$rule" ]] && continue
    pat=$(printf '%s' "$rule" | jq -r '.target // empty')
    [[ -z "$pat" ]] && continue
    # shellcheck disable=SC2254
    case "$abs" in
      $pat)
        file_path="$candidate"
        related_pattern=$(printf '%s' "$rule" | jq -r '.requiredReadPattern // empty')
        target_name=$(printf '%s' "$rule" | jq -r '.hint // empty')
        break
        ;;
    esac
  done < <(cfg_list '.requireReading.rules[]? | @json')
  [[ -n "$related_pattern" ]] && break
done < <(harness_tool_paths "$input")

[[ -n "$related_pattern" ]] || exit 0
[[ -n "$target_name" ]] || target_name="対象資料"
principal=$(harness_principal)

last_user_msg=$(harness_last_user_message "$input")
if harness_has_token "$last_user_msg" '[hook-bypass: resource-reading]'; then
  exit 0
fi

if harness_read_paths "$input" | grep -qE -- "$related_pattern"; then
  exit 0
fi

cat >&2 <<MSG
[必読資料の未読]
${file_path} を編集しようとしていますが、直近で ${target_name} を読み取っていません。

対象資料を読み取ってから、もう一度編集してください。
緊急時のみ、${principal}が [hook-bypass: resource-reading] だけの行を書くことで回避できます。
MSG
exit 2
