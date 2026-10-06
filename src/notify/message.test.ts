import { describe, expect, it } from "vitest";

import { isoDateOf } from "../calendar/date";
import type { CalendarData } from "../publish/buildCalendarData";
import type { HhMm } from "../settings/validate";
import { buildMessage } from "./message";
import { NoticeKind } from "./plan";

const PAGE_URL = "https://example.cloudfront.net/";
const HOURS: CalendarData["businessHours"] = { open: "11:00" as HhMm, close: "15:00" as HhMm };

// 2026-10-11 は日曜、2026-10-21 は水曜
const SUNDAY = isoDateOf(2026, 10, 11);
const WEDNESDAY = isoDateOf(2026, 10, 21);

describe("buildMessage", () => {
  it("should build the regular message with the business hours and the page url", () => {
    const text = buildMessage({
      targetDate: SUNDAY,
      kind: NoticeKind.Regular,
      businessHours: HOURS,
      pageUrl: PAGE_URL,
    });

    expect(text).toBe(
      [
        "田中屋です。明日10月11日（日）は通常どおり営業します。",
        "営業時間 11:00〜15:00",
        "営業日カレンダー https://example.cloudfront.net/",
      ].join("\n"),
    );
  });

  it("should build the special-open message with the business hours", () => {
    const text = buildMessage({
      targetDate: WEDNESDAY,
      kind: NoticeKind.SpecialOpen,
      businessHours: HOURS,
      pageUrl: PAGE_URL,
    });

    expect(text).toBe(
      [
        "田中屋です。明日10月21日（水）は臨時営業します。",
        "営業時間 11:00〜15:00",
        "営業日カレンダー https://example.cloudfront.net/",
      ].join("\n"),
    );
  });

  it("should build the special-closed message without the business hours", () => {
    const text = buildMessage({
      targetDate: SUNDAY,
      kind: NoticeKind.SpecialClosed,
      businessHours: HOURS,
      pageUrl: PAGE_URL,
    });

    expect(text).toBe(
      [
        "田中屋です。明日10月11日（日）は臨時休業します。",
        "営業日カレンダー https://example.cloudfront.net/",
      ].join("\n"),
    );
    expect(text).not.toContain("営業時間");
  });

  it("should reflect the weekday label of the target date", () => {
    const text = buildMessage({
      targetDate: WEDNESDAY,
      kind: NoticeKind.Regular,
      businessHours: HOURS,
      pageUrl: PAGE_URL,
    });

    expect(text).toContain("10月21日（水）");
  });
});
