#!/bin/bash
# LINE Bot MCP Server のツールを、依頼者宛ての push と読み取りだけに限る
# (PreToolUse, matcher=MCP ツールと kiro_powers)
#
# 本プロジェクトの LINE 公式アカウントは本番の1つだけで、友だちは実際のお客様。
# 友だち全員への配信は前日配信の Lambda だけが行い、エージェントからは行わない
# (.kiro/steering/line-messaging.md)。
#
# 判定:
#   - LINE のツールとみなすもの
#       tool_name が @<サーバー名>/<ツール名> で、サーバー名に line を含む
#       tool_name が kiro_powers で action が use、powerName か serverName に line を含む
#       tool_name が mcp_ で始まり line を含む（ツール名は既知の名前の末尾一致で取る）
#   - 通すもの（lineSend.allowedTools）: 既定は push_text_message / push_flex_message /
#     get_message_quota
#   - push（lineSend.pushTools）は、引数に userId が無いときだけ通す。宛先は MCP サーバーの
#     既定の宛先（DESTINATION_USER_ID = 依頼者）になる
#   - それ以外の LINE のツール（broadcast、リッチメニューの作成・削除、友だちの一覧など）は止める
#   - サーバー名を問わず、ツール名が broadcast_ / multicast / narrowcast で始まるものは止める
#   バイパスの文字列は設けない。変えるときは設定ファイルを直す（設定は harness-change で保護）
#
# 確認用の記録: 判定した呼び出しの tool_name と、判定に使ったツール名だけを
#   state/line-calls.log に残す（引数は残さない）
#
# 設定 (.kiro/harness/config.json):
#   lineSend.enabled       false で無効化
#   lineSend.allowedTools  通すツール名
#   lineSend.pushTools     userId が無いときだけ通すツール名

set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/lib/config.sh"

input=$(cat)
if ! command -v jq >/dev/null 2>&1; then
  echo "[harness] jq が無いため line-send-check を実行できません" >&2
  exit 2
fi
harness_load_config "$input"
harness_config_guard pre
cfg_enabled '.lineSend' || exit 0

KNOWN_LINE_TOOLS=(push_text_message push_flex_message broadcast_text_message broadcast_flex_message
  get_profile get_message_quota get_rich_menu_list delete_rich_menu set_rich_menu_default
  cancel_rich_menu_default create_rich_menu get_follower_ids get_group_summary)

tool_name=$(printf '%s' "$input" | jq -r '.tool_name // empty')
lower=$(printf '%s' "$tool_name" | tr '[:upper:]' '[:lower:]')
normalized=$(printf '%s' "$lower" | tr -d '_-')

# 名前に区切られた line（line-bot、power-line-announce 等）を含むか。pipeline 等には一致させない
LINE_NAME_RE='(^|[^a-z])line([^a-z]|$)|linebot'
names_line() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | grep -qE "$LINE_NAME_RE"; }

short=""
args='{}'
is_line=0
if [[ "$tool_name" == @*/* ]]; then
  server="${tool_name#@}"
  server="${server%%/*}"
  short="${tool_name##*/}"
  args=$(printf '%s' "$input" | jq -c '.tool_input // {}')
  names_line "$server" && is_line=1
elif [[ "$normalized" == "kiropowers" ]]; then
  action=$(printf '%s' "$input" | jq -r '.tool_input.action // empty')
  [[ "$action" == "use" ]] || exit 0
  short=$(printf '%s' "$input" | jq -r '.tool_input.toolName // empty')
  args=$(printf '%s' "$input" | jq -c '.tool_input.arguments // {}')
  owner=$(printf '%s' "$input" | jq -r '[.tool_input.powerName, .tool_input.serverName] | map(. // "") | join(" ")')
  names_line "$owner" && is_line=1
elif [[ "$lower" == mcp_* ]] && names_line "${lower#mcp_}"; then
  for t in "${KNOWN_LINE_TOOLS[@]}"; do
    if [[ "$lower" == *"$t" ]]; then
      short="$t"
      break
    fi
  done
  [[ -n "$short" ]] || short="$lower"
  args=$(printf '%s' "$input" | jq -c '.tool_input // {}')
  is_line=1
else
  exit 0
fi

short_lower=$(printf '%s' "$short" | tr '[:upper:]' '[:lower:]')
mass_send=0
[[ "$short_lower" == broadcast_* || "$short_lower" == multicast* || "$short_lower" == narrowcast* ]] && mass_send=1
[[ "$is_line" -eq 1 || "$mass_send" -eq 1 ]] || exit 0

mkdir -p "$HARNESS_STATE_DIR" 2>/dev/null && chmod 700 "$HARNESS_STATE_DIR" 2>/dev/null || true
( umask 077; printf '%s\t%s\t%s\n' "$(date +%s)" "$tool_name" "$short" >> "$HARNESS_STATE_DIR/line-calls.log" ) 2>/dev/null || true

block() {
  cat >&2 <<MSG
[LINE 送信の制限]
$1
本プロジェクトの LINE 公式アカウントは本番だけで、友だちは実際のお客様です。
エージェントから使えるのは、依頼者宛ての push（userId を指定しない）と get_message_quota だけです。
友だち全員への配信は前日配信の Lambda だけが行います（.kiro/steering/line-messaging.md）。
MSG
  exit 2
}

if [[ "$mass_send" -eq 1 ]]; then
  block "友だち全員などへの一斉送信のツール (${short}) は止めます。"
fi

allowed=()
while IFS= read -r t; do [[ -n "$t" ]] && allowed+=("$t"); done < <(cfg_list '.lineSend.allowedTools[]?')
[[ ${#allowed[@]} -gt 0 ]] || allowed=(push_text_message push_flex_message get_message_quota)
push_tools=()
while IFS= read -r t; do [[ -n "$t" ]] && push_tools+=("$t"); done < <(cfg_list '.lineSend.pushTools[]?')
[[ ${#push_tools[@]} -gt 0 ]] || push_tools=(push_text_message push_flex_message)

is_allowed=0
for t in "${allowed[@]}"; do [[ "$short" == "$t" ]] && is_allowed=1; done
[[ "$is_allowed" -eq 1 ]] || block "LINE のツール ${short} は使えません。"

for t in "${push_tools[@]}"; do
  if [[ "$short" == "$t" ]]; then
    user_id=$(printf '%s' "$args" | jq -r 'if type == "object" then (.userId // "") | tostring else "" end' 2>/dev/null || echo "invalid")
    if [[ -n "$user_id" ]]; then
      block "userId を指定した push (${short}) は止めます。userId を省き、既定の宛先（依頼者）に送ってください。"
    fi
  fi
done
exit 0
