/**
 * 日本時間の暦日を扱う関数。
 *
 * 日付は `YYYY-MM-DD` の文字列（IsoDate）で扱い、計算はすべて UTC のミリ秒で行う。
 * 実行環境のタイムゾーンを読む API（getHours、getDay、toLocaleDateString など）は使わない。
 * 日本時間には夏時間がないため、UTC+9 の固定で計算する。
 */

/** 曜日の名前。並びは getUTCDay() の値（0 = 日曜）と同じ */
export const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** 日本時間の暦日。形式は YYYY-MM-DD */
export type IsoDate = string & { readonly brand: "IsoDate" };

/** 日付の値や計算が正しくないときのエラー */
export class InvalidDateError extends Error {
  override readonly name = "InvalidDateError";
}

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type DateParts = { year: number; month: number; day: number };

/** 年月日を UTC の 0 時のミリ秒にする。setUTCFullYear を使い、0〜99 年も正しく扱う */
const utcMsOf = ({ year, month, day }: DateParts): number => {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getTime();
};

const partsOfUtcMs = (ms: number): DateParts => {
  const date = new Date(ms);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};

const format = ({ year, month, day }: DateParts): IsoDate => {
  if (!Number.isInteger(year) || year < 0 || year > 9999) {
    throw new InvalidDateError(`Year out of range: ${year}`);
  }
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}` as IsoDate;
};

const parse = (value: string): DateParts | null => {
  const match = ISO_DATE_PATTERN.exec(value);
  if (match === null) {
    return null;
  }
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1) {
    return null;
  }
  const roundTrip = partsOfUtcMs(utcMsOf(parts));
  const exists =
    roundTrip.year === parts.year && roundTrip.month === parts.month && roundTrip.day === parts.day;
  return exists ? parts : null;
};

const parseOrThrow = (value: string): DateParts => {
  const parts = parse(value);
  if (parts === null) {
    throw new InvalidDateError(`Invalid ISO date: ${value}`);
  }
  return parts;
};

/** `YYYY-MM-DD` の実在する日なら true */
export const isIsoDate = (value: string): value is IsoDate => parse(value) !== null;

/** 年月日から IsoDate を作る。実在しない日はエラー */
export const isoDateOf = (year: number, month: number, day: number): IsoDate => {
  const value = format({ year, month, day });
  parseOrThrow(value);
  return value;
};

/** 時刻を日本時間の日付にする */
export const toJstDate = (instant: Date): IsoDate => {
  const ms = instant.getTime();
  if (Number.isNaN(ms)) {
    throw new InvalidDateError("Invalid Date instance");
  }
  return format(partsOfUtcMs(ms + JST_OFFSET_MS));
};

/** 日付に日数を足す（負の数で引く） */
export const addDays = (date: IsoDate, days: number): IsoDate => {
  if (!Number.isInteger(days)) {
    throw new InvalidDateError(`Days must be an integer: ${days}`);
  }
  return format(partsOfUtcMs(utcMsOf(parseOrThrow(date)) + days * MS_PER_DAY));
};

/** 日付の曜日 */
export const weekdayOf = (date: IsoDate): Weekday => {
  const index = new Date(utcMsOf(parseOrThrow(date))).getUTCDay();
  const weekday = WEEKDAYS[index];
  if (weekday === undefined) {
    throw new InvalidDateError(`Unexpected weekday index: ${index}`);
  }
  return weekday;
};

/** 月の日数 */
export const daysInMonth = (year: number, month: number): number =>
  partsOfUtcMs(utcMsOf({ year, month: month + 1, day: 1 }) - MS_PER_DAY).day;

/** 年と月（month は 1〜12） */
export type YearMonth = { year: number; month: number };

/** 日付の年と月 */
export const yearMonthOf = (date: IsoDate): YearMonth => {
  const { year, month } = parseOrThrow(date);
  return { year, month };
};

/** 年月に月数を足す（負の数で引く） */
export const addMonths = ({ year, month }: YearMonth, months: number): YearMonth => {
  if (!Number.isInteger(months)) {
    throw new InvalidDateError(`Months must be an integer: ${months}`);
  }
  const index = year * 12 + (month - 1) + months;
  return { year: Math.floor(index / 12), month: (((index % 12) + 12) % 12) + 1 };
};

/** 月の1日 */
export const firstDayOf = ({ year, month }: YearMonth): IsoDate => isoDateOf(year, month, 1);

/** 月の末日 */
export const lastDayOf = ({ year, month }: YearMonth): IsoDate =>
  isoDateOf(year, month, daysInMonth(year, month));
