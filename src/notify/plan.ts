/**
 * 前日配信の計画（要件 5.2〜5.6）。純粋関数。
 * 案内の種類は、公開用データの対象日の値で決める（公開ページと内容をそろえるため）。
 */
import { addDays, toJstDate } from "../calendar/date";
import type { IsoDate } from "../calendar/date";
import type { CalendarData } from "../publish/buildCalendarData";

/** 案内の種類。通常営業、臨時休業、臨時営業 */
export const NoticeKind = {
  Regular: "regular",
  SpecialClosed: "specialClosed",
  SpecialOpen: "specialOpen",
} as const;
export type NoticeKind = (typeof NoticeKind)[keyof typeof NoticeKind];

export type NotificationPlan =
  | { action: "send"; targetDate: IsoDate; kind: NoticeKind }
  /** 既定の営業日でなく例外もない（要件 5.6） */
  | { action: "skip"; targetDate: IsoDate }
  /** 対象日が公開用データにない（最後のデプロイから11か月を超えた場合など） */
  | { action: "outOfRange"; targetDate: IsoDate };

/** 対象日は、実行時刻を日本時間にした日付の翌日（要件 5.2） */
export const targetDateOf = (now: Date): IsoDate => addDays(toJstDate(now), 1);

/** 実行時刻 now の配信の計画を作る */
export const planNotification = (data: CalendarData, now: Date): NotificationPlan => {
  const targetDate = targetDateOf(now);
  const day = data.days.find((candidate) => candidate.date === targetDate);
  if (day === undefined) {
    return { action: "outOfRange", targetDate };
  }
  if (!day.exception) {
    return day.open
      ? { action: "send", targetDate, kind: NoticeKind.Regular }
      : { action: "skip", targetDate };
  }
  return {
    action: "send",
    targetDate,
    kind: day.open ? NoticeKind.SpecialOpen : NoticeKind.SpecialClosed,
  };
};
