/**
 * 公開ページのビルド（要件 2.2、2.9、3.1、3.2、5.1）。
 *
 *   1. 設定ファイルを読み、検証する。違反があれば全件を表示して終了コード1。何も書かない
 *   2. 公開用データ（calendar.json）を作る
 *   3. public/ を複製し、src/publish/page.ts を esbuild で app.js にまとめる
 *   4. 配信時刻から EventBridge Scheduler の cron 式を作り、deploy-parameters.txt に書く
 *
 * 使い方: npm run build:site [-- --settings <設定ファイル>] [--out <出力先>]
 *   既定は data/settings.json と dist/。見本で試すときは --settings data/settings.example.json
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

import { buildCalendarData } from "../src/publish/buildCalendarData";
import { validateSettings } from "../src/settings/validate";
import type { HhMm, ValidationIssue } from "../src/settings/validate";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export type BuildSiteOptions = {
  settingsPath: string;
  outDir: string;
  now: Date;
  publicDir?: string;
  entryPoint?: string;
};

export type BuildSiteResult =
  | { ok: true; siteDir: string; scheduleExpression: string }
  | { ok: false; issues: ValidationIssue[] };

/** 配信時刻（日本時間）を EventBridge Scheduler の cron 式にする。タイムゾーンは template.yaml で Asia/Tokyo を指定する */
export const toScheduleExpression = (notifyTime: HhMm): string => {
  const [hour = "0", minute = "0"] = notifyTime.split(":");
  return `cron(${Number(minute)} ${Number(hour)} * * ? *)`;
};

const readSettings = async (settingsPath: string): Promise<unknown> => {
  let text: string;
  try {
    text = await readFile(settingsPath, "utf8");
  } catch {
    throw new SettingsReadError(`Settings file not found or unreadable: ${settingsPath}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SettingsReadError(`Settings file is not valid JSON: ${settingsPath}`);
  }
};

class SettingsReadError extends Error {
  override readonly name = "SettingsReadError";
}

/** 公開ページをビルドする。設定に違反があれば何も書かずに ok: false を返す */
export const buildSite = async (options: BuildSiteOptions): Promise<BuildSiteResult> => {
  const publicDir = options.publicDir ?? path.join(ROOT, "public");
  const entryPoint = options.entryPoint ?? path.join(ROOT, "src/publish/page.ts");

  let raw: unknown;
  try {
    raw = await readSettings(options.settingsPath);
  } catch (error) {
    if (error instanceof SettingsReadError) {
      return { ok: false, issues: [{ path: "", message: error.message }] };
    }
    throw error;
  }
  const result = validateSettings(raw);
  if (!result.ok) {
    return { ok: false, issues: result.issues };
  }

  const siteDir = path.join(options.outDir, "site");
  const scheduleExpression = toScheduleExpression(result.settings.notifyTime);
  await rm(siteDir, { recursive: true, force: true });
  await mkdir(siteDir, { recursive: true });
  await cp(publicDir, siteDir, { recursive: true });
  const calendar = buildCalendarData({ settings: result.settings, now: options.now });
  await writeFile(path.join(siteDir, "calendar.json"), `${JSON.stringify(calendar)}\n`, "utf8");
  await build({
    entryPoints: [entryPoint],
    outfile: path.join(siteDir, "app.js"),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    legalComments: "none",
    logLevel: "warning",
  });
  await writeFile(
    path.join(options.outDir, "deploy-parameters.txt"),
    `NotifyScheduleExpression="${scheduleExpression}"\n`,
    "utf8",
  );
  return { ok: true, siteDir, scheduleExpression };
};

const argValue = (args: readonly string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const settingsPath = path.resolve(
    argValue(args, "--settings") ?? path.join(ROOT, "data/settings.json"),
  );
  const outDir = path.resolve(argValue(args, "--out") ?? path.join(ROOT, "dist"));
  const result = await buildSite({ settingsPath, outDir, now: new Date() });
  if (!result.ok) {
    console.error(`Settings are invalid (${settingsPath}):`);
    for (const issue of result.issues) {
      console.error(`  - ${issue.path === "" ? "(root)" : issue.path}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`Built ${result.siteDir}`);
  console.log(`NotifyScheduleExpression: ${result.scheduleExpression}`);
};

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(invokedPath)).href
) {
  await main();
}
