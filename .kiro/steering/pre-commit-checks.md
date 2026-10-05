---
inclusion: always
---

# コミット前チェック

git commit の前に、次を行う。

1. `git diff --cached` で、`.env`、`data/settings.json`、トークンらしき文字列がステージされていないことを確かめる
2. TypeScript を変えたとき：`npx eslint <変えたディレクトリ>` と `npx prettier --check <変えたファイル>` を実行する。違反を直して再ステージする
3. `src/` を変えたとき：`npx vitest run` を実行し、すべて通ることを確かめる

`package.json` ができるまでは、2 と 3 を省く。
