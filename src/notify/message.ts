/**
 * 前日配信の案内の文面（要件 5.7）。
 *
 * 本体の実装と単体テストは、tasks 4.4（Kiro Web のクラウドセッション）で行う。
 * ここでは、配信処理（runNotify）と Lambda の入口（handler）から使う型と関数の形だけを決める。
 * 実装されるまでは呼ぶと例外を投げる。配信処理は、この例外では配信記録を作らずに終わる。
 */
import type { IsoDate } from "../calendar/date";
import type { CalendarData } from "../publish/buildCalendarData";
import type { NoticeKind } from "./plan";

export type MessageInput = {
  targetDate: IsoDate;
  kind: NoticeKind;
  businessHours: CalendarData["businessHours"];
  pageUrl: string;
};

/** まだ実装していない機能を呼んだときのエラー */
export class NotImplementedError extends Error {
  override readonly name = "NotImplementedError";
}

/**
 * 案内の文面を作る。
 * 対象日の月日と曜日、案内の種類、営業する場合は営業時間、公開ページの URL を含める。
 */
// TODO(4.4): design.md「src/notify/：前日配信」の文面の案に沿って実装し、単体テストを足す
export const buildMessage = (input: MessageInput): string => {
  throw new NotImplementedError(`buildMessage is not implemented yet (kind: ${input.kind})`);
};
