/**
 * 公開用データ（calendar.json）の生成と読み込み（要件3）。
 * 公開ページと配信処理の両方が、このデータで営業可否を決める。
 */
import {
  addDays,
  addMonths,
  firstDayOf,
  isIsoDate,
  lastDayOf,
  toJstDate,
  yearMonthOf,
} from "../calendar/date";
import type { IsoDate } from "../calendar/date";
import { judgeDay, toBusinessRules } from "../calendar/judge";
import type { DayStatus } from "../calendar/judge";
import { isHhMm } from "../settings/validate";
import type { Settings } from "../settings/validate";

export type CalendarDay = { date: IsoDate } & DayStatus;

/** 公開用データ。各日の値、営業時間、対象範囲、生成日時だけを持つ（要件 3.4、3.5） */
export type CalendarData = {
  version: 1;
  generatedAt: string;
  range: { from: IsoDate; to: IsoDate };
  businessHours: Settings["businessHours"];
  days: CalendarDay[];
};

/** 公開用データに含める月数（デプロイ月を含む） */
export const CALENDAR_MONTHS = 12;

/** now の日本時間の月の1日から、11か月後の月末までの範囲（要件 3.2） */
export const calendarRangeOf = (now: Date): CalendarData["range"] => {
  const start = yearMonthOf(toJstDate(now));
  return { from: firstDayOf(start), to: lastDayOf(addMonths(start, CALENDAR_MONTHS - 1)) };
};

/** 設定から公開用データを作る（要件 3.1〜3.5） */
export const buildCalendarData = (input: { settings: Settings; now: Date }): CalendarData => {
  const { settings, now } = input;
  const range = calendarRangeOf(now);
  const rules = toBusinessRules(settings);
  const days: CalendarDay[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) {
    days.push({ date, ...judgeDay(date, rules) });
  }
  return {
    version: 1,
    generatedAt: now.toISOString(),
    range,
    businessHours: { open: settings.businessHours.open, close: settings.businessHours.close },
    days,
  };
};

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasExactKeys = (obj: PlainObject, keys: readonly string[]): boolean => {
  const actual = Object.keys(obj);
  return actual.length === keys.length && keys.every((key) => Object.hasOwn(obj, key));
};

const isDateString = (value: unknown): value is IsoDate =>
  typeof value === "string" && isIsoDate(value);

const parseDay = (value: unknown): CalendarDay | null => {
  if (!isPlainObject(value) || !hasExactKeys(value, ["date", "open", "exception"])) {
    return null;
  }
  const { date, open, exception } = value;
  if (!isDateString(date) || typeof open !== "boolean" || typeof exception !== "boolean") {
    return null;
  }
  return { date, open, exception };
};

const parseBusinessHours = (value: unknown): CalendarData["businessHours"] | null => {
  if (!isPlainObject(value) || !hasExactKeys(value, ["open", "close"])) {
    return null;
  }
  const { open, close } = value;
  if (typeof open !== "string" || typeof close !== "string" || !isHhMm(open) || !isHhMm(close)) {
    return null;
  }
  return open < close ? { open, close } : null;
};

/** 範囲の初日から最終日まで、欠けも重複もなく並んでいるか */
const coversRange = (days: CalendarDay[], range: CalendarData["range"]): boolean => {
  let expected = range.from;
  for (const day of days) {
    if (day.date !== expected) {
      return false;
    }
    expected = addDays(expected, 1);
  }
  return days.length > 0 && addDays(range.to, 1) === expected;
};

/**
 * 公開用データの形を確かめる。正しくなければ null。
 * 配信処理（S3 から読む）と公開ページ（ブラウザで読む）で使う。
 */
export const parseCalendarData = (raw: unknown): CalendarData | null => {
  if (!isPlainObject(raw)) {
    return null;
  }
  if (!hasExactKeys(raw, ["version", "generatedAt", "range", "businessHours", "days"])) {
    return null;
  }
  const { version, generatedAt, range, businessHours, days } = raw;
  if (version !== 1 || typeof generatedAt !== "string" || Number.isNaN(Date.parse(generatedAt))) {
    return null;
  }
  if (!isPlainObject(range) || !hasExactKeys(range, ["from", "to"])) {
    return null;
  }
  const { from, to } = range;
  const hours = parseBusinessHours(businessHours);
  if (
    !isDateString(from) ||
    !isDateString(to) ||
    from > to ||
    hours === null ||
    !Array.isArray(days)
  ) {
    return null;
  }
  const parsedDays: CalendarDay[] = [];
  for (const value of days) {
    const day = parseDay(value);
    if (day === null) {
      return null;
    }
    parsedDays.push(day);
  }
  if (!coversRange(parsedDays, { from, to })) {
    return null;
  }
  return { version: 1, generatedAt, range: { from, to }, businessHours: hours, days: parsedDays };
};
