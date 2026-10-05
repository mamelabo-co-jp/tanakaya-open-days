#!/bin/bash
# harness-ja (Kiro 版) の hook 合成テスト。
# 一時ディレクトリに記録 (state) と hook 入力 JSON を作り、hook を期待する終了コードつきで
# 実行する。設定は本物の .kiro/harness/config.json を使う (本プロジェクト向けの調整を確かめるため)。
# 末尾に PASS / FAIL 件数を出し、FAIL が 1 件でもあれば exit 1。
#
# 使い方: bash .kiro/harness/tests/run.sh
set -euo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
H="$ROOT/hooks"
command -v jq >/dev/null 2>&1 || { echo "jq が見つかりません" >&2; exit 1; }

W=$(mktemp -d)
trap 'rm -rf "$W"' EXIT
PROJ="$W/proj"
mkdir -p "$PROJ/docs/runbooks" "$PROJ/.kiro/steering" "$PROJ/globdir"
touch "$PROJ/globdir/a.txt" "$PROJ/globdir/b.txt"
export HARNESS_STATE_DIR="$W/state"
export HARNESS_CONFIG="$ROOT/config.json"
unset USER_PROMPT || true

pass=0; fail=0
check() { # check <期待する終了コード> <名前> <hook> <入力 JSON>
  local want="$1" name="$2" hook="$3" in="$4" got=0 err
  err=$(printf '%s' "$in" | bash "$H/$hook" 2>&1 >/dev/null) || got=$?
  if [[ "$got" == "$want" ]]; then
    pass=$((pass + 1))
  else
    fail=$((fail + 1))
    printf 'FAIL: %s (期待 %s / 実際 %s)\n%s\n' "$name" "$want" "$got" "$err"
  fi
}
shell_in() { # shell_in <コマンド> [session] [tool_name]
  jq -cn --arg c "$1" --arg s "${2:-s1}" --arg t "${3:-execute_bash}" --arg cwd "$PROJ" \
    '{hook_event_name:"preToolUse", cwd:$cwd, session_id:$s, tool_name:$t, tool_input:{command:$c}}'
}
write_in() { # write_in <tool_name> <キー> <パス> [session]
  jq -cn --arg t "$1" --arg k "$2" --arg p "$3" --arg s "${4:-s1}" --arg cwd "$PROJ" \
    '{hook_event_name:"preToolUse", cwd:$cwd, session_id:$s, tool_name:$t, tool_input:{($k):$p}}'
}
prompt() { # prompt <本文> [session]  (IDE と同じく USER_PROMPT で渡す)
  jq -cn --arg s "${2:-s1}" '{hook_event_name:"userPromptSubmit", session_id:$s}' \
    | USER_PROMPT="$1" bash "$H/record-prompt.sh"
}
prompt_stdin() { # prompt_stdin <本文> [session]  (CLI と同じく標準入力の .prompt で渡す)
  jq -cn --arg p "$1" --arg s "${2:-s1}" '{hook_event_name:"userPromptSubmit", session_id:$s, prompt:$p}' \
    | bash "$H/record-prompt.sh"
}
readf() { # readf <パス> [session] [tool_name]
  jq -cn --arg p "$1" --arg s "${2:-s1}" --arg t "${3:-read_file}" --arg cwd "$PROJ" \
    '{hook_event_name:"postToolUse", cwd:$cwd, session_id:$s, tool_name:$t, tool_input:{path:$p}, tool_response:{}}' \
    | bash "$H/record-read.sh"
}
reset_state() { rm -rf "$HARNESS_STATE_DIR"; }

# --- 記録の hook -------------------------------------------------------------
reset_state
out=$(jq -cn '{session_id:"s1"}' | USER_PROMPT="こんにちは" bash "$H/record-prompt.sh"; echo "rc=$?")
[[ "$out" == "rc=0" ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: record-prompt の出力が空でない / 終了コード: $out"; }
[[ "$(cat "$HARNESS_STATE_DIR/prompt-s1.txt")" == "こんにちは" ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: record-prompt が記録していない"; }
[[ "$(stat -c %a "$HARNESS_STATE_DIR")" == "700" ]] && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: state/ の権限が 700 でない"; }
readf "docs/plan.md"
grep -qF "$PROJ/docs/plan.md" "$HARNESS_STATE_DIR/reads.log" && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: record-read が相対パスを絶対パスで記録していない"; }
jq -cn --arg cwd "$PROJ" '{cwd:$cwd, session_id:"s1", tool_name:"fs_write", tool_input:{path:"docs/runbooks/x.md"}}' | bash "$H/record-read.sh"
! grep -qF "docs/runbooks/x.md" "$HARNESS_STATE_DIR/reads.log" && pass=$((pass + 1)) || { fail=$((fail + 1)); echo "FAIL: record-read が書き込みを読み取りとして記録した"; }

# --- cloud-change-check: 読み取り専用は通す ---------------------------------------
reset_state; prompt "作業して"
for c in "aws sts get-caller-identity" "aws s3 ls s3://bucket" "aws --region ap-northeast-1 dynamodb scan --table-name t" \
         "aws cognito-idp admin-get-user --user-pool-id p --username u" "aws lambda get-function --function-name f" \
         "sam build" "sam validate --lint" "sam local invoke NotifyFunction" "sam logs -n NotifyFunction --tail" \
         "sam remote test-event list NotifyFunction" "sam list stack-outputs" "echo sam deploy" "git commit -m 'aws s3 rm'" \
         "npx cdk synth" "cdk diff"; do
  check 0 "読み取り専用: $c" cloud-change-check.sh "$(shell_in "$c")"
done

# --- cloud-change-check: 変更系は止める ------------------------------------------
for c in "sam deploy --guided" "sam deploy --config-env prod" "cd infra && sam delete --no-prompts" "sam sync --watch" \
         "sam remote invoke NotifyFunction" "sam remote test-event put NotifyFunction --name e" "sam package --s3-bucket b" \
         "aws --profile prod s3 rm s3://b/x" "aws --region=ap-northeast-1 s3 sync out s3://b" \
         "aws lambda invoke --function-name notify out.json" "aws dynamodb batch-write-item --request-items file://x.json" \
         "aws dynamodb put-item --table-name t --item {}" "aws ssm put-parameter --name /line/token --type SecureString" \
         "aws cognito-idp admin-create-user --user-pool-id p --username u" "aws cloudformation execute-change-set --change-set-name c" \
         "aws scheduler update-schedule --name s" "aws sns publish --topic-arn a --message m" \
         "AWS_PROFILE=prod aws s3 rm s3://b/k" "sudo -E aws s3 rb s3://b" "/usr/local/bin/aws s3 rm s3://b/k"; do
  check 2 "変更系: $c" cloud-change-check.sh "$(shell_in "$c")"
done
(cd "$PROJ/globdir" && check 2 "glob を展開しない: aws s3 rm s3://b/*" cloud-change-check.sh "$(shell_in 'aws s3 rm s3://b/*')")
check 2 "camelCase のツール名でも検査する" cloud-change-check.sh "$(shell_in "sam deploy" s1 executeBash)"
check 0 "シェル以外のツールは対象外" cloud-change-check.sh "$(shell_in "sam deploy" s1 fs_write)"
check 2 "案件に無い CLI (cdk) は設定不足で止める" cloud-change-check.sh "$(shell_in "npx cdk deploy")"

# --- cloud-change-check: 通過条件 ------------------------------------------------
reset_state; prompt $'デプロイしてください\n[change-go: tanakaya]'
check 2 "承認のみ・手順書未読" cloud-change-check.sh "$(shell_in "sam deploy")"
reset_state; prompt "デプロイしてください"; readf "docs/runbooks/deploy.md"
check 2 "手順書のみ・承認なし" cloud-change-check.sh "$(shell_in "sam deploy")"
reset_state; prompt $'手順書どおりに\n[change-go: tanakaya]'; readf "docs/runbooks/deploy.md"
check 0 "承認と手順書の両方" cloud-change-check.sh "$(shell_in "sam deploy")"
check 2 "別 session の読み取りは数えない" cloud-change-check.sh "$(shell_in "sam deploy" s9)"
reset_state; prompt '`[change-go: tanakaya]` とは何ですか'; readf "docs/runbooks/deploy.md"
check 2 "文中の承認の文字列は無効" cloud-change-check.sh "$(shell_in "sam deploy")"
reset_state; prompt $'[change-go: other]'; readf "docs/runbooks/deploy.md"
check 2 "別案件の承認の文字列は無効" cloud-change-check.sh "$(shell_in "sam deploy")"
reset_state; prompt "[hook-bypass: cloud-change]"
check 0 "バイパス" cloud-change-check.sh "$(shell_in "sam deploy")"
reset_state; prompt_stdin $'[change-go: tanakaya]'; readf "docs/runbooks/deploy.md" s1 readFile
check 0 "標準入力の .prompt と camelCase の読み取りツール" cloud-change-check.sh "$(shell_in "sam deploy")"
reset_state; prompt "[change-go: tanakaya]"; readf "docs/runbooks/deploy.md"; prompt "次へ"
check 2 "次の入力で承認は切れる" cloud-change-check.sh "$(shell_in "sam deploy")"
reset_state; prompt "[change-go: tanakaya]"; readf "docs/runbooks/deploy.md"
touch -d '3 hours ago' "$HARNESS_STATE_DIR/prompt-s1.txt" "$HARNESS_STATE_DIR/prompt-default.txt"
check 2 "古い承認 (120 分超) は無効" cloud-change-check.sh "$(shell_in "sam deploy")"
reset_state; prompt "[change-go: tanakaya]"
printf '%s\ts1\t%s\n' "$(( $(date +%s) - 4 * 3600 ))" "$PROJ/docs/runbooks/deploy.md" > "$HARNESS_STATE_DIR/reads.log"
check 2 "古い読み取り (180 分超) は数えない" cloud-change-check.sh "$(shell_in "sam deploy")"

# --- kiro-change-check ----------------------------------------------------------
reset_state; prompt "steering を直して"
check 2 "fs_write で .kiro/steering" kiro-change-check.sh "$(write_in fs_write path "$PROJ/.kiro/steering/x.md")"
check 2 "str_replace で相対パスの .kiro/settings" kiro-change-check.sh "$(write_in str_replace path ".kiro/settings/mcp.json")"
check 2 "strReplace (camelCase)" kiro-change-check.sh "$(write_in strReplace path ".kiro/agents/a.json")"
check 2 "delete_file の targetFile" kiro-change-check.sh "$(write_in delete_file targetFile ".kiro/agents/a.json")"
check 2 "smart_relocate の destinationPath" kiro-change-check.sh "$(write_in smart_relocate destinationPath ".kiro/steering/y.md")"
check 2 "設定ファイル自体" kiro-change-check.sh "$(write_in fs_write path ".kiro/harness/config.json")"
check 0 ".kiro/specs は除外" kiro-change-check.sh "$(write_in fs_write path ".kiro/specs/feat/requirements.md")"
check 0 ".kiro 外の書き込み" kiro-change-check.sh "$(write_in fs_write path "src/index.ts")"
check 0 "読み取りツールは対象外" kiro-change-check.sh "$(write_in read_file path ".kiro/steering/x.md")"
check 0 "シェル: cat" kiro-change-check.sh "$(shell_in "cat .kiro/steering/x.md")"
check 0 "シェル: sed -n" kiro-change-check.sh "$(shell_in "sed -n 1,5p .kiro/steering/x.md")"
check 0 "シェル: コピー元が .kiro" kiro-change-check.sh "$(shell_in "cp .kiro/steering/x.md /tmp/")"
check 0 "シェル: mkdir" kiro-change-check.sh "$(shell_in "mkdir -p .kiro/steering/sub")"
check 0 "シェル: state だけに書く" kiro-change-check.sh "$(shell_in "echo x > .kiro/harness/state/a; cat .kiro/steering/b.md")"
check 0 "シェル: state の削除" kiro-change-check.sh "$(shell_in "rm -rf .kiro/harness/state")"
check 2 "シェル: 除外パスに似た別パス" kiro-change-check.sh "$(shell_in "rm -rf .kiro/harness/statefoo")"
check 2 "シェル: state と steering の両方に書く" kiro-change-check.sh "$(shell_in "echo x > .kiro/harness/state/a && echo y > .kiro/steering/b.md")"
check 2 "シェル: control_bash_process" kiro-change-check.sh "$(shell_in "echo hi >> .kiro/steering/x.md" s1 control_bash_process)"
check 2 "シェル: リダイレクト" kiro-change-check.sh "$(shell_in "echo hi > .kiro/steering/x.md")"
check 2 "シェル: sed -i" kiro-change-check.sh "$(shell_in "sed -i s/a/b/ .kiro/steering/x.md")"
check 2 "シェル: コピー先が .kiro" kiro-change-check.sh "$(shell_in "cp /tmp/x.md .kiro/steering/")"
check 2 "シェル: rm" kiro-change-check.sh "$(shell_in "rm .kiro/hooks/a.json")"
check 2 "シェル: git checkout" kiro-change-check.sh "$(shell_in "git checkout -- .kiro/steering/x.md")"
check 2 "シェル: インタプリタ" kiro-change-check.sh "$(shell_in $'python3 - <<X\nopen(".kiro/steering/x.md","w")\nX')"
check 2 "シェル: tee" kiro-change-check.sh "$(shell_in "echo a | tee .kiro/steering/x.md")"
reset_state; prompt $'この内容で反映してください\n[harness-go]'
check 0 "承認あり: fs_write" kiro-change-check.sh "$(write_in fs_write path ".kiro/steering/x.md")"
check 0 "承認あり: シェル" kiro-change-check.sh "$(shell_in "echo hi > .kiro/steering/x.md")"
reset_state; prompt '[harness-go] を書けば通りますか'
check 2 "文中の承認の文字列は無効" kiro-change-check.sh "$(write_in fs_write path ".kiro/steering/x.md")"

# --- require-reading ------------------------------------------------------------
reset_state; prompt "requirements を作って"
check 2 "計画を読まずに requirements" require-reading.sh "$(write_in fs_write path ".kiro/specs/open-days/requirements.md")"
check 0 "design.md は対象外" require-reading.sh "$(write_in fs_write path ".kiro/specs/open-days/design.md")"
readf "docs/plan.md" s2
check 2 "別 session で計画を読んだだけ" require-reading.sh "$(write_in fs_write path ".kiro/specs/open-days/requirements.md")"
readf "docs/plan.md"
check 0 "計画を読んだ後" require-reading.sh "$(write_in str_replace path ".kiro/specs/open-days/requirements.md")"
reset_state; prompt "[hook-bypass: resource-reading]"
check 0 "バイパス" require-reading.sh "$(write_in fs_write path ".kiro/specs/open-days/requirements.md")"

# --- 設定ファイル ---------------------------------------------------------------
reset_state; prompt "x"
HARNESS_CONFIG="$W/none.json" check 0 "設定ファイルが無ければ何もしない" cloud-change-check.sh "$(shell_in "sam deploy")"
printf '{ broken' > "$W/broken.json"
HARNESS_CONFIG="$W/broken.json" check 2 "設定ファイルが壊れていれば止める" kiro-change-check.sh "$(write_in fs_write path "src/a.ts")"

printf '\nPASS: %d / FAIL: %d\n' "$pass" "$fail"
[[ "$fail" -eq 0 ]]
