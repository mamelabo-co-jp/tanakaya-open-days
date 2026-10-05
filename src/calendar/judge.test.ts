import { describe, expect, it } from "vitest";

import { isIsoDate } from "./date";
import type { IsoDate } from "./date";
import { judgeDay, toBusinessRules } from "./judge";

const d = (value: string): IsoDate => {
  if (!isIsoDate(value)) {
    throw new Error(`test fixture is not a valid date: ${value}`);
  }
  return value;
};

// 2026-10-11 は日曜、2026-10-14 は水曜
const SUNDAY = d("2026-10-11");
const WEDNESDAY = d("2026-10-14");

describe("judgeDay", () => {
  const sundayOnly = toBusinessRules({
    openWeekdays: ["sun"],
    closedDates: [],
    specialOpenDates: [],
  });

  it("should open on a business weekday without exceptions", () => {
    expect(judgeDay(SUNDAY, sundayOnly)).toEqual({ open: true, exception: false });
  });

  it("should close on other weekdays without exceptions", () => {
    expect(judgeDay(WEDNESDAY, sundayOnly)).toEqual({ open: false, exception: false });
  });

  it("should close on a registered closed date", () => {
    const rules = toBusinessRules({
      openWeekdays: ["sun"],
      closedDates: [SUNDAY],
      specialOpenDates: [],
    });
    expect(judgeDay(SUNDAY, rules)).toEqual({ open: false, exception: true });
  });

  it("should open on a registered special open date", () => {
    const rules = toBusinessRules({
      openWeekdays: ["sun"],
      closedDates: [],
      specialOpenDates: [WEDNESDAY],
    });
    expect(judgeDay(WEDNESDAY, rules)).toEqual({ open: true, exception: true });
  });

  it("should use the business weekdays from the settings, not a fixed weekday", () => {
    const wednesdayOnly = toBusinessRules({
      openWeekdays: ["wed"],
      closedDates: [],
      specialOpenDates: [],
    });
    expect(judgeDay(WEDNESDAY, wednesdayOnly).open).toBe(true);
    expect(judgeDay(SUNDAY, wednesdayOnly).open).toBe(false);
  });
});
