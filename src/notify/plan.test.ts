import { describe, expect, it } from "vitest";

import { buildCalendarData } from "../publish/buildCalendarData";
import { validateSettings } from "../settings/validate";
import { planNotification } from "./plan";

// 2026-10-18 は日曜（休業日）、2026-10-21 は水曜（臨時営業日）。範囲は 2026-10-01〜2027-09-30
const result = validateSettings({
  openWeekdays: ["sun"],
  closedDates: ["2026-10-18"],
  specialOpenDates: ["2026-10-21"],
  businessHours: { open: "11:00", close: "15:00" },
  notifyTime: "18:00",
});
if (!result.ok) {
  throw new Error("invalid test settings");
}
const DATA = buildCalendarData({
  settings: result.settings,
  now: new Date("2026-10-05T10:00:00Z"),
});

// 18:00 JST = 09:00 UTC
const runAt = (jstDate: string): Date => new Date(`${jstDate}T09:00:00.000Z`);

describe("planNotification", () => {
  it("should send the regular notice on the day before a regular Sunday", () => {
    expect(planNotification(DATA, runAt("2026-10-10"))).toEqual({
      action: "send",
      targetDate: "2026-10-11",
      kind: "regular",
    });
  });

  it("should send the special closed notice on the day before a closed Sunday", () => {
    expect(planNotification(DATA, runAt("2026-10-17"))).toMatchObject({
      action: "send",
      kind: "specialClosed",
    });
  });

  it("should send the special open notice on the day before a special open day", () => {
    expect(planNotification(DATA, runAt("2026-10-20"))).toMatchObject({
      action: "send",
      kind: "specialOpen",
    });
  });

  it("should skip when the next day is a regular closed day", () => {
    expect(planNotification(DATA, runAt("2026-10-12"))).toEqual({
      action: "skip",
      targetDate: "2026-10-13",
    });
  });

  it("should use the JST date of the run time (run just after JST midnight)", () => {
    // 2026-10-10 15:00 UTC = 2026-10-11 00:00 JST。対象日は 10-12（月曜）
    expect(planNotification(DATA, new Date("2026-10-10T15:00:00.000Z")).targetDate).toBe(
      "2026-10-12",
    );
  });

  it("should report outOfRange when the target date is not in the data", () => {
    expect(planNotification(DATA, runAt("2027-09-30"))).toEqual({
      action: "outOfRange",
      targetDate: "2027-10-01",
    });
  });
});
