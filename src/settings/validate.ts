/**
 * 設定ファイル（data/settings.json）の型と検証（要件2）。
 * 違反はすべて集めて返す（要件 2.9）。メッセージは英語。
 */
import { WEEKDAYS, isIsoDate, weekdayOf } from "../calendar/date";
import type { IsoDate, Weekday } from "../calendar/date";

/** 24時間制の時刻。形式は HH:MM（00:00〜23:59） */
export type HhMm = string & { readonly brand: "HhMm" };

/** 検証済みの設定 */
export type Settings = {
  openWeekdays: Weekday[];
  closedDates: IsoDate[];
  specialOpenDates: IsoDate[];
  businessHours: { open: HhMm; close: HhMm };
  notifyTime: HhMm;
};

/** 違反1件。path は `closedDates[2]`、`businessHours.open` のような項目の位置 */
export type ValidationIssue = { path: string; message: string };

export type ValidationResult =
  { ok: true; settings: Settings } | { ok: false; issues: ValidationIssue[] };

const SETTINGS_KEYS = [
  "openWeekdays",
  "closedDates",
  "specialOpenDates",
  "businessHours",
  "notifyTime",
] as const;
const BUSINESS_HOURS_KEYS = ["open", "close"] as const;
const HH_MM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_LIST = WEEKDAYS.join(", ");

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isWeekday = (value: unknown): value is Weekday =>
  typeof value === "string" && (WEEKDAYS as readonly string[]).includes(value);

/** `HH:MM`（00:00〜23:59）なら true */
export const isHhMm = (value: string): value is HhMm => HH_MM_PATTERN.test(value);

const joinPath = (prefix: string, key: string): string =>
  prefix === "" ? key : `${prefix}.${key}`;

/** 定義していない項目と、足りない項目を違反にする（要件 2.1、2.8） */
const checkKeys = (
  obj: PlainObject,
  allowed: readonly string[],
  prefix: string,
  issues: ValidationIssue[],
): void => {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      issues.push({ path: joinPath(prefix, key), message: "Unknown field." });
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(obj, key)) {
      issues.push({ path: joinPath(prefix, key), message: "Required field is missing." });
    }
  }
};

/**
 * 一覧の検証結果。items は正しい要素だけ（重複は除く）。valid は一覧全体に違反がないかどうか。
 * 一部の要素が不正でも、正しい要素は後の検証（例外の組み合わせ）に使い、違反をすべて集める。
 */
type ListResult<TItem> = { items: TItem[]; valid: boolean };

/** 要素ごとに検証する。配列でなければ items は空 */
const validateList = <TItem extends string>(input: {
  path: string;
  value: unknown;
  isItem: (item: unknown) => item is TItem;
  itemMessage: (item: unknown) => string;
  issues: ValidationIssue[];
}): ListResult<TItem> => {
  const { path, value, isItem, itemMessage, issues } = input;
  if (!Array.isArray(value)) {
    issues.push({ path, message: "Must be an array." });
    return { items: [], valid: false };
  }
  const before = issues.length;
  const seen = new Set<string>();
  const items: TItem[] = [];
  value.forEach((item: unknown, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isItem(item)) {
      issues.push({ path: itemPath, message: itemMessage(item) });
      return;
    }
    if (seen.has(item)) {
      issues.push({ path: itemPath, message: `Duplicate value: ${item}` });
      return;
    }
    seen.add(item);
    items.push(item);
  });
  return { items, valid: issues.length === before };
};

/** 要件 2.3 */
const validateWeekdays = (value: unknown, issues: ValidationIssue[]): ListResult<Weekday> => {
  const result = validateList({
    path: "openWeekdays",
    value,
    isItem: isWeekday,
    itemMessage: (item) => `Unknown weekday: ${JSON.stringify(item)}. Use one of ${WEEKDAY_LIST}.`,
    issues,
  });
  if (result.valid && result.items.length === 0) {
    issues.push({ path: "openWeekdays", message: "Must contain at least one weekday." });
    return { items: [], valid: false };
  }
  return result;
};

/** 要件 2.4 */
const validateDates = (
  path: "closedDates" | "specialOpenDates",
  value: unknown,
  issues: ValidationIssue[],
): ListResult<IsoDate> =>
  validateList({
    path,
    value,
    isItem: (item): item is IsoDate => typeof item === "string" && isIsoDate(item),
    itemMessage: (item) => `Must be an existing date in YYYY-MM-DD: ${JSON.stringify(item)}`,
    issues,
  });

const MISSING: ListResult<never> = { items: [], valid: false };

/** 要件 2.7 */
const validateTime = (path: string, value: unknown, issues: ValidationIssue[]): HhMm | null => {
  if (typeof value === "string" && isHhMm(value)) {
    return value;
  }
  issues.push({ path, message: `Must be a 24-hour time in HH:MM: ${JSON.stringify(value)}` });
  return null;
};

/** 要件 2.7、2.8 */
const validateBusinessHours = (
  value: unknown,
  issues: ValidationIssue[],
): Settings["businessHours"] | null => {
  if (!isPlainObject(value)) {
    issues.push({ path: "businessHours", message: "Must be an object with open and close." });
    return null;
  }
  const before = issues.length;
  checkKeys(value, BUSINESS_HOURS_KEYS, "businessHours", issues);
  const open = Object.hasOwn(value, "open")
    ? validateTime("businessHours.open", value.open, issues)
    : null;
  const close = Object.hasOwn(value, "close")
    ? validateTime("businessHours.close", value.close, issues)
    : null;
  if (open !== null && close !== null && open >= close) {
    issues.push({
      path: "businessHours",
      message: `Open (${open}) must be before close (${close}).`,
    });
  }
  return issues.length === before && open !== null && close !== null ? { open, close } : null;
};

/** 元の配列での位置を付けて、指定の値の要素を探す（違反の path に使う） */
const indexedDates = (value: unknown, dates: readonly IsoDate[]): Array<[IsoDate, number]> => {
  const wanted = new Set(dates);
  const found: Array<[IsoDate, number]> = [];
  if (Array.isArray(value)) {
    value.forEach((item: unknown, index) => {
      if (typeof item === "string" && isIsoDate(item) && wanted.has(item)) {
        wanted.delete(item);
        found.push([item, index]);
      }
    });
  }
  return found;
};

/**
 * 要件 2.5、2.6。正しい日付だけを対象にする。
 * 営業曜日が不正なとき（weekdays.valid が false）は曜日の検証を行わない（同じ原因の違反を重ねないため）。
 */
const checkExceptions = (input: {
  raw: PlainObject;
  weekdays: ListResult<Weekday>;
  closedDates: ListResult<IsoDate>;
  specialOpenDates: ListResult<IsoDate>;
  issues: ValidationIssue[];
}): void => {
  const { raw, weekdays, closedDates, specialOpenDates, issues } = input;
  const closed = indexedDates(raw.closedDates, closedDates.items);
  const special = indexedDates(raw.specialOpenDates, specialOpenDates.items);
  const closedSet = new Set(closedDates.items);
  for (const [date, index] of special) {
    if (closedSet.has(date)) {
      issues.push({
        path: `specialOpenDates[${index}]`,
        message: `Date is also listed in closedDates: ${date}`,
      });
    }
  }
  if (!weekdays.valid) {
    return;
  }
  const openSet = new Set(weekdays.items);
  for (const [date, index] of closed) {
    if (!openSet.has(weekdayOf(date))) {
      issues.push({
        path: `closedDates[${index}]`,
        message: `Closed date must fall on a business weekday (openWeekdays): ${date} is ${weekdayOf(date)}`,
      });
    }
  }
  for (const [date, index] of special) {
    if (openSet.has(weekdayOf(date))) {
      issues.push({
        path: `specialOpenDates[${index}]`,
        message: `Special open date must not fall on a business weekday (openWeekdays): ${date} is ${weekdayOf(date)}`,
      });
    }
  }
};

/**
 * 設定ファイルの中身を検証する（要件2）。
 * 違反をすべて集め、1つでもあれば ok: false を返す。
 */
export const validateSettings = (raw: unknown): ValidationResult => {
  if (!isPlainObject(raw)) {
    return { ok: false, issues: [{ path: "", message: "Settings must be a JSON object." }] };
  }
  const issues: ValidationIssue[] = [];
  checkKeys(raw, SETTINGS_KEYS, "", issues);
  const has = (key: (typeof SETTINGS_KEYS)[number]): boolean => Object.hasOwn(raw, key);

  const weekdays = has("openWeekdays") ? validateWeekdays(raw.openWeekdays, issues) : MISSING;
  const closedDates = has("closedDates")
    ? validateDates("closedDates", raw.closedDates, issues)
    : MISSING;
  const specialOpenDates = has("specialOpenDates")
    ? validateDates("specialOpenDates", raw.specialOpenDates, issues)
    : MISSING;
  const businessHours = has("businessHours")
    ? validateBusinessHours(raw.businessHours, issues)
    : null;
  const notifyTime = has("notifyTime") ? validateTime("notifyTime", raw.notifyTime, issues) : null;
  checkExceptions({ raw, weekdays, closedDates, specialOpenDates, issues });

  if (issues.length > 0 || businessHours === null || notifyTime === null) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    settings: {
      openWeekdays: weekdays.items,
      closedDates: closedDates.items,
      specialOpenDates: specialOpenDates.items,
      businessHours,
      notifyTime,
    },
  };
};
