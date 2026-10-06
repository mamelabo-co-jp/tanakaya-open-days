/**
 * 前日配信の案内の文面（要件 5.7）。純粋関数。
 *
 * 配信処理（runNotify）と Lambda の入口（handler）が、MessageInput を渡して文面を作る。
 * 営業する日（通常営業・臨時営業）は営業時間を出し、臨時休業では出さない。
 * 日付と営業時間の表記は、公開ページと同じ src/calendar/format.ts を使う。
 */
import { formatBusinessHours, formatMonthDayWithWeekday } from "../calendar/format";
import type { IsoDate } from "../calendar/date";
import type { CalendarData } from "../publish/buildCalendarData";
import { NoticeKind } from "./plan";

export type MessageInput = {
  targetDate: IsoDate;
  kind: NoticeKind;
  businessHours: CalendarData["businessHours"];
  pageUrl: string;
};

/** 案内の種類ごとの本文（対象日の月日と曜日を差し込む） */
const noticeText: Readonly<Record<NoticeKind, (dateLabel: string) => string>> = {
  [NoticeKind.Regular]: (dateLabel) => `明日${dateLabel}は通常どおり営業します。`,
  [NoticeKind.SpecialOpen]: (dateLabel) => `明日${dateLabel}は臨時営業します。`,
  [NoticeKind.SpecialClosed]: (dateLabel) => `明日${dateLabel}は臨時休業します。`,
};

/** 営業時間を出す案内の種類（営業する日だけ）。臨時休業では出さない */
const SHOWS_BUSINESS_HOURS: ReadonlySet<NoticeKind> = new Set([
  NoticeKind.Regular,
  NoticeKind.SpecialOpen,
]);

/**
 * 案内の文面を作る（要件 5.7）。
 * 対象日の月日と曜日、案内の種類、営業する場合は営業時間、公開ページの URL を含める。
 */
export const buildMessage = (input: MessageInput): string => {
  const dateLabel = formatMonthDayWithWeekday(input.targetDate);
  const lines = [`田中屋です。${noticeText[input.kind](dateLabel)}`];
  if (SHOWS_BUSINESS_HOURS.has(input.kind)) {
    lines.push(`営業時間 ${formatBusinessHours(input.businessHours)}`);
  }
  lines.push(`営業日カレンダー ${input.pageUrl}`);
  return lines.join("\n");
};
