/**
 * 公開ページが表示する「今日」と月の選択（要件 4.2〜4.5）。
 * 閲覧者の端末時刻を日本時間にした日付を「今日」とする。純粋関数で、ブラウザから呼ぶ。
 */
import { addMonths, toJstDate, yearMonthOf } from "../calendar/date";
import type { IsoDate, YearMonth } from "../calendar/date";
import type { CalendarData, CalendarDay } from "./buildCalendarData";

export type TodayView =
  | {
      kind: "inRange";
      date: IsoDate;
      open: boolean;
      exception: boolean;
      businessHours: CalendarData["businessHours"];
    }
  | { kind: "outOfRange"; date: IsoDate };

export type MonthView = YearMonth & { days: CalendarDay[] };

/** 閲覧時刻 now の「今日」の営業可否。公開用データの範囲外なら outOfRange（要件 4.5） */
export const selectToday = (data: CalendarData, now: Date): TodayView => {
  const date = toJstDate(now);
  const day = data.days.find((candidate) => candidate.date === date);
  if (day === undefined) {
    return { kind: "outOfRange", date };
  }
  return {
    kind: "inRange",
    date,
    open: day.open,
    exception: day.exception,
    businessHours: data.businessHours,
  };
};

const sameMonth = (date: IsoDate, { year, month }: YearMonth): boolean => {
  const target = yearMonthOf(date);
  return target.year === year && target.month === month;
};

/** 「今日」の月と翌月の日を、公開用データの範囲内のものだけ返す。日が1つもない月は返さない（要件 4.3） */
export const selectMonths = (data: CalendarData, now: Date): MonthView[] => {
  const thisMonth = yearMonthOf(toJstDate(now));
  return [thisMonth, addMonths(thisMonth, 1)]
    .map((month) => ({ ...month, days: data.days.filter((day) => sameMonth(day.date, month)) }))
    .filter((view) => view.days.length > 0);
};
