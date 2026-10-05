#!/bin/bash
# harness-ja (Kiro 版) 共通ライブラリ。
# 元: mamezou/mamezou-claude-plugins の plugins/harness-ja/hooks/lib/config.sh (MIT)
#
# Claude Code 版との違い:
#   - 設定ファイルは .kiro/harness/config.json (HARNESS_CONFIG で上書き可)
#   - Kiro の hook 入力には transcript_path が無い。代わりに次の記録を使う
#       依頼者の最後の入力: UserPromptSubmit hook (record-prompt.sh) が
#                           state/prompt-<session>.txt に保存したもの
#       読み取りの履歴:     PostToolUse hook (record-read.sh) が state/reads.log に
#                           「時刻<TAB>session<TAB>絶対パス」で追記したもの
#   - ツール名は Kiro の組み込みツール名 (execute_bash / fs_write / read_file 等)。
#     表記ゆれ (executeBash / fsWrite 等) を吸収するため harness_tool_kind で分類する
#
# 使い方:
#   harness_load_config "$hook_input_json"
#   harness_config_guard pre
#   cfg '.cloudChange.enabled' 'true'
#   cfg_list '.requireReading.rules[]? | @json'
#   cfg_enabled '.cloudChange'
#   harness_last_user_message "$hook_input_json"
#   harness_read_paths "$hook_input_json"

HARNESS_LIB_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
HARNESS_DIR=$(cd "$HARNESS_LIB_DIR/.." && pwd)
# .kiro/harness の 2 つ上がプロジェクトルート
HARNESS_PROJECT_ROOT=$(cd "$HARNESS_DIR/../.." && pwd)
HARNESS_STATE_DIR="${HARNESS_STATE_DIR:-$HARNESS_DIR/state}"

HARNESS_CONFIG_PATH=""
HARNESS_CONFIG_JSON="{}"
HARNESS_CONFIG_BROKEN=0

harness_load_config() {
  local candidate="${HARNESS_CONFIG:-$HARNESS_DIR/config.json}"
  [[ -f "$candidate" ]] || return 0
  HARNESS_CONFIG_PATH="$candidate"
  if HARNESS_CONFIG_JSON=$(jq -c . "$HARNESS_CONFIG_PATH" 2>/dev/null); then
    HARNESS_CONFIG_BROKEN=0
  else
    HARNESS_CONFIG_JSON="{}"
    HARNESS_CONFIG_BROKEN=1
  fi
}

# harness_config_guard <pre|post>
# 設定ファイルが JSON として読めないとき、pre は exit 2 (ツールを止める)、post は exit 0
harness_config_guard() {
  [[ "$HARNESS_CONFIG_BROKEN" -eq 1 ]] || return 0
  printf '設定ファイルが読めません: %s\n' "$HARNESS_CONFIG_PATH" >&2
  [[ "${1:-pre}" == "pre" ]] && exit 2
  exit 0
}

cfg() {
  local filter="$1" default="${2:-}" val
  val=$(printf '%s' "$HARNESS_CONFIG_JSON" | jq -r "${filter} // empty" 2>/dev/null || true)
  if [[ -z "$val" ]]; then printf '%s' "$default"; else printf '%s' "$val"; fi
}

cfg_list() {
  printf '%s' "$HARNESS_CONFIG_JSON" | jq -r "$1" 2>/dev/null || true
}

# 設定ファイルがあり、.enabled が false でなければ 0
cfg_enabled() {
  local v
  [[ -n "$HARNESS_CONFIG_PATH" ]] || return 1
  v=$(printf '%s' "$HARNESS_CONFIG_JSON" | jq -r "if ${1}.enabled == false then \"false\" else \"true\" end" 2>/dev/null || echo true)
  [[ "$v" != "false" ]]
}

harness_principal() {
  cfg '.principal' '依頼者'
}

# ツール名を shell / write / read / aws / other に分類する。
# Kiro の正規名 (snake_case)、別名、camelCase 表記のいずれでも同じ分類になるよう、
# 小文字化して _ と - を落としてから照合する。
harness_tool_kind() {
  local n
  n=$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]' | tr -d '_-')
  case "$n" in
    executebash|executecmd|shell|bash|controlbashprocess) echo shell ;;
    fswrite|write|fsappend|append|strreplace|deletefile|delete|smartrelocate|semanticrename|edit|multiedit|editfile|createfile) echo write ;;
    fsread|read|readfile|readfiles|readmultiplefiles|readcode) echo read ;;
    useaws|aws) echo aws ;;
    *) echo other ;;
  esac
}

# hook 入力の session_id をファイル名に使える形にする。無ければ default
harness_session_key() {
  local sid
  sid=$(printf '%s' "${1:-}" | jq -r '.session_id // .sessionId // empty' 2>/dev/null || true)
  sid=$(printf '%s' "$sid" | tr -c 'A-Za-z0-9_-' '_')
  printf '%s' "${sid:-default}"
}

# パスを絶対パスへ正規化する (/./ と重複スラッシュ、末尾の / を畳む。.. とリンクは解決しない)
harness_normalize_path() {
  local p="$1" base="${2:-$HARNESS_PROJECT_ROOT}"
  case "$p" in
    /*) : ;;
    "~/"*) p="${HOME}/${p#\~/}" ;;
    *) p="${base}/$p" ;;
  esac
  printf '%s' "$p" | sed -E 's#/\./#/#g; s#^\./##; s#/+#/#g; s#(.)/$#\1#'
}

# ツール入力からファイルパスを 1 行 1 件で取り出す (書き込み系・読み取り系で共通)
harness_tool_paths() {
  printf '%s' "${1:-}" | jq -r '
    .tool_input // {} |
    ( (.path, .file_path, .filePath, .targetFile, .target_file, .sourcePath, .destinationPath) // empty ),
    ( .paths[]? // empty ),
    ( .files[]? | if type == "string" then . else (.path // empty) end )
    | select(type == "string" and length > 0)' 2>/dev/null || true
}

# harness_has_token <text> <token>
# 文字列がそれだけの行 (前後の空白のみ可) にあるときだけ 0。引用・質問の中は 1
harness_has_token() {
  local text="${1:-}" token="${2:-}"
  [[ -n "$token" && -n "$text" ]] || return 1
  printf '%s\n' "$text" | awk -v tok="$token" '
    {
      line = $0
      gsub(/\r/, "", line)
      gsub(/^[ \t]+|[ \t]+$/, "", line)
      if (line == tok) { found = 1; exit }
    }
    END { exit(found ? 0 : 1) }'
}

# 依頼者の最後の入力 (record-prompt.sh の記録) を返す。
# 同じ session の記録を優先し、無ければ session を問わない最新の記録を使う。
# 記録が approvalMaxAgeMinutes (既定 120 分) より古い場合は空を返す
# (記録の hook が動かなかったときに、古い承認の文字列で通さないため)。
harness_last_user_message() {
  local key file max_age mtime now
  key=$(harness_session_key "${1:-}")
  file="$HARNESS_STATE_DIR/prompt-${key}.txt"
  [[ -f "$file" ]] || file="$HARNESS_STATE_DIR/prompt-default.txt"
  [[ -f "$file" ]] || return 0
  max_age=$(cfg '.approvalMaxAgeMinutes' '120')
  mtime=$(stat -c %Y "$file" 2>/dev/null || echo 0)
  now=$(date +%s)
  (( now - mtime <= max_age * 60 )) || return 0
  cat "$file"
}

# 直近に読み取りツールで読んだファイルの絶対パスを 1 行 1 件で返す。
# 同じ session の記録のうち、readWindowMinutes (既定 180 分) 以内のものに限る。
# session_id が無い入力では session を問わず時間だけで絞る。
harness_read_paths() {
  local key window now log
  key=$(harness_session_key "${1:-}")
  window=$(cfg '.readWindowMinutes' '180')
  now=$(date +%s)
  log="$HARNESS_STATE_DIR/reads.log"
  [[ -f "$log" ]] || return 0
  awk -F '\t' -v key="$key" -v since="$(( now - window * 60 ))" '
    $1 >= since && (key == "default" || $2 == key) { print $3 }' "$log"
}
