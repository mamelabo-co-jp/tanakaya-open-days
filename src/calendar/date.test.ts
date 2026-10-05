import { describe, expect, it } from "vitest";

import {
  InvalidDateError,
  addDays,
  daysInMonth,
  isIsoDate,
  isoDateOf,
  toJstDate,
  weekdayOf,
} from "./date";
import type { IsoDate } from "./date";

const d = (value: string): IsoDate => {
  if (!isIsoDate(value)) {
    throw new Error(`test fixture is not a valid date: ${value}`);
  }
  return value;
};

describe("toJstDate", () => {
  it("should return the same day when UTC is 14:59:59.999 (JST 23:59:59.999)", () => {
    expect(toJstDate(new Date("2026-10-10T14:59:59.999Z"))).toBe("2026-10-10");
  });

  it("should return the next day when UTC is 15:00 (JST 00:00)", () => {
    expect(toJstDate(new Date("2026-10-10T15:00:00.000Z"))).toBe("2026-10-11");
  });

  it("should cross the month end at JST midnight", () => {
    expect(toJstDate(new Date("2026-10-31T15:00:00.000Z"))).toBe("2026-11-01");
  });

  it("should cross the year end at JST midnight", () => {
    expect(toJstDate(new Date("2026-12-31T14:59:59.999Z"))).toBe("2026-12-31");
    expect(toJstDate(new Date("2026-12-31T15:00:00.000Z"))).toBe("2027-01-01");
  });

  it("should reach Feb 29 in a leap year", () => {
    expect(toJstDate(new Date("2028-02-28T15:00:00.000Z"))).toBe("2028-02-29");
  });

  it("should throw when the instant is an invalid Date", () => {
    expect(() => toJstDate(new Date(Number.NaN))).toThrow(InvalidDateError);
  });
});

describe("addDays", () => {
  it("should move across month end, year end and Feb 29", () => {
    expect(addDays(d("2026-10-31"), 1)).toBe("2026-11-01");
    expect(addDays(d("2026-12-31"), 1)).toBe("2027-01-01");
    expect(addDays(d("2028-02-28"), 1)).toBe("2028-02-29");
    expect(addDays(d("2027-02-28"), 1)).toBe("2027-03-01");
  });

  it("should subtract when days is negative", () => {
    expect(addDays(d("2027-01-01"), -1)).toBe("2026-12-31");
  });

  it("should throw when days is not an integer", () => {
    expect(() => addDays(d("2026-10-10"), 0.5)).toThrow(InvalidDateError);
  });
});

describe("weekdayOf", () => {
  it("should return the weekday of known dates", () => {
    expect(weekdayOf(d("2026-10-11"))).toBe("sun");
    expect(weekdayOf(d("2026-10-12"))).toBe("mon");
    expect(weekdayOf(d("2026-10-17"))).toBe("sat");
    expect(weekdayOf(d("2024-02-29"))).toBe("thu");
  });
});

describe("isIsoDate", () => {
  it("should accept existing dates including Feb 29 in a leap year", () => {
    expect(isIsoDate("2026-10-10")).toBe(true);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-12-31")).toBe(true);
  });

  it.each([
    ["2026-02-29", "Feb 29 in a common year"],
    ["2026-04-31", "Apr 31"],
    ["2026-13-01", "month 13"],
    ["2026-00-10", "month 0"],
    ["2026-10-00", "day 0"],
    ["2026/10/10", "slashes"],
    ["2026-1-10", "one-digit month"],
    ["20261010", "no separators"],
    ["2026-10-10T00:00", "with time"],
    ["", "empty"],
  ])("should reject %s (%s)", (value) => {
    expect(isIsoDate(value)).toBe(false);
  });
});

describe("isoDateOf", () => {
  it("should zero-pad the parts", () => {
    expect(isoDateOf(2026, 1, 5)).toBe("2026-01-05");
  });

  it("should throw for a date that does not exist", () => {
    expect(() => isoDateOf(2026, 2, 29)).toThrow(InvalidDateError);
  });
});

describe("daysInMonth", () => {
  it("should return the number of days including leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});
