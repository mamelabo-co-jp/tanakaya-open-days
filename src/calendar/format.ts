/**
 * お客様向けの日付と時刻の表記。公開ページと案内の文面（4.4）で同じ表記を使う。
 */
import { WEEKDAYS, weekdayOf, yearMonthOf } from "./date";
import type { IsoDate, Weekday, YearMonth } from "./date";

/** 曜日の日本語の1文字。並びは WEEKDAYS と同じ（日曜から） */
export const WEEKDAY_LABELS: Readonly<Record<Weekday, string>> = {
  sun: "日",
  mon: "月",
  tue: "火",
  wed: "水",
  thu: "木",
  fri: "金",
  sat: "土",
};

/** 日曜から土曜の順の曜日の日本語の1文字 */
export const WEEKDAY_LABEL_LIST: readonly string[] = WEEKDAYS.map(
  (weekday) => WEEKDAY_LABELS[weekday],
);

/** 「10月11日（日）」 */
export const formatMonthDayWithWeekday = (date: IsoDate): string => {
  const [, month = "", day = ""] = date.split("-");
  return `${Number(month)}月${Number(day)}日（${WEEKDAY_LABELS[weekdayOf(date)]}）`;
};

/** 「2026年10月」 */
export const formatYearMonth = ({ year, month }: YearMonth): string => `${year}年${month}月`;

/** 日付の属する「2026年10月」 */
export const formatYearMonthOf = (date: IsoDate): string => formatYearMonth(yearMonthOf(date));

/** 「11:00〜15:00」 */
export const formatBusinessHours = (hours: { open: string; close: string }): string =>
  `${hours.open}〜${hours.close}`;
