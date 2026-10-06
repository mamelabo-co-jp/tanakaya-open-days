/**
 * 前日配信の Lambda のビルド。src/notify/handler.ts を esbuild で1ファイルにまとめ、
 * dist/lambda/index.mjs に書く。AWS SDK v3 は nodejs24.x のランタイムにあるため含めない。
 * template.yaml の CodeUri は dist/lambda。sam build はこのフォルダーの package.json を使う。
 *
 * 使い方: npm run build:lambda
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "dist/lambda");

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });
await build({
  entryPoints: [path.join(ROOT, "src/notify/handler.ts")],
  outfile: path.join(OUT_DIR, "index.mjs"),
  bundle: true,
  platform: "node",
  target: ["node24"],
  format: "esm",
  external: ["@aws-sdk/*"],
  minify: false,
  sourcemap: false,
  legalComments: "none",
  logLevel: "warning",
});
await writeFile(
  path.join(OUT_DIR, "package.json"),
  `${JSON.stringify({ name: "tanakaya-notify", version: "0.1.0", private: true, type: "module" }, null, 2)}\n`,
  "utf8",
);
console.log(`Built ${path.join(OUT_DIR, "index.mjs")}`);
