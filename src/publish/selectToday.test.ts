import { describe, expect, it } from "vitest";

import { validateSettings } from "../settings/validate";
import { buildCalendarData } from "./buildCalendarData";
import type { CalendarData } from "./buildCalendarData";
import { selectMonths, selectToday } from "./selectToday";

const dataBuiltAt = (iso: string): CalendarData => {
  const result = validateSettings({
    openWeekdays: ["sun"],
    closedDates: ["2026-10-18"],
    specialOpenDates: [],
    businessHours: { open: "11:00", close: "15:00" },
    notifyTime: "18:00",
  });
  if (!result.ok) {
    throw new Error("invalid test settings");
  }
  return buildCalendarData({ settings: result.settings, now: new Date(iso) });
};

// 範囲は 2026-10-01〜2027-09-30
const DATA = dataBuiltAt("2026-10-05T10:00:00.000Z");

describe("selectToday", () => {
  it("should switch to the next day at JST midnight without redeploying", () => {
    expect(selectToday(DATA, new Date("2026-10-10T14:59:59.999Z"))).toMatchObject({
      date: "2026-10-10",
      open: false,
    });
    expect(selectToday(DATA, new Date("2026-10-10T15:00:00.000Z"))).toMatchObject({
      date: "2026-10-11",
      open: true,
      exception: false,
    });
  });

  it("should include the business hours", () => {
    expect(selectToday(DATA, new Date("2026-10-11T03:00:00.000Z"))).toMatchObject({
      businessHours: { open: "11:00", close: "15:00" },
    });
  });

  it("should return outOfRange after the last day", () => {
    expect(selectToday(DATA, new Date("2027-09-30T15:00:00.000Z"))).toEqual({
      kind: "outOfRange",
      date: "2027-10-01",
    });
  });
});

describe("selectMonths", () => {
  it("should return this month and the next month", () => {
    const months = selectMonths(DATA, new Date("2026-10-20T03:00:00.000Z"));
    expect(months.map(({ year, month, days }) => [year, month, days.length])).toEqual([
      [2026, 10, 31],
      [2026, 11, 30],
    ]);
  });

  it("should roll over the year from December to January", () => {
    const months = selectMonths(DATA, new Date("2026-12-31T14:59:59.999Z"));
    expect(months.map(({ year, month }) => [year, month])).toEqual([
      [2026, 12],
      [2027, 1],
    ]);
  });

  it("should return only the months inside the range", () => {
    const months = selectMonths(DATA, new Date("2027-09-10T03:00:00.000Z"));
    expect(months.map(({ year, month }) => [year, month])).toEqual([[2027, 9]]);
  });

  it("should return nothing when today is far outside the range", () => {
    expect(selectMonths(DATA, new Date("2028-01-10T03:00:00.000Z"))).toEqual([]);
  });
});
