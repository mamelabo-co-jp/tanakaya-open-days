/**
 * 営業日の判定（要件1）。純粋関数で、営業曜日はコードに持たず引数で受け取る。
 */
import { weekdayOf } from "./date";
import type { IsoDate, Weekday } from "./date";

/** 1日の判定結果。exception は例外（休業日・臨時営業日）による結果かどうか */
export type DayStatus = { open: boolean; exception: boolean };

/** 判定に使う規則 */
export type BusinessRules = {
  openWeekdays: ReadonlySet<Weekday>;
  closedDates: ReadonlySet<IsoDate>;
  specialOpenDates: ReadonlySet<IsoDate>;
};

/** 規則の元になる値。検証済みの設定（Settings）をそのまま渡せる */
export type BusinessRulesSource = {
  openWeekdays: readonly Weekday[];
  closedDates: readonly IsoDate[];
  specialOpenDates: readonly IsoDate[];
};

/**
 * 日付1日の営業可否を判定する。
 * 休業日 > 臨時営業日 > 営業曜日の順に見る。検証済みの設定では両方の一覧に入る日はない。
 */
export const judgeDay = (date: IsoDate, rules: BusinessRules): DayStatus => {
  if (rules.closedDates.has(date)) {
    return { open: false, exception: true };
  }
  if (rules.specialOpenDates.has(date)) {
    return { open: true, exception: true };
  }
  return { open: rules.openWeekdays.has(weekdayOf(date)), exception: false };
};

/** 設定から判定用の規則を作る */
export const toBusinessRules = (source: BusinessRulesSource): BusinessRules => ({
  openWeekdays: new Set(source.openWeekdays),
  closedDates: new Set(source.closedDates),
  specialOpenDates: new Set(source.specialOpenDates),
});
