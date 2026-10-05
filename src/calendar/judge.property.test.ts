import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_DATE,
  MIN_DATE,
  arbIsoDate,
  arbOpenWeekdays,
  arbValidSettings,
} from "../testing/arbitraries";
import { validateSettings } from "../settings/validate";
import type { Settings } from "../settings/validate";
import { WEEKDAYS, addDays, weekdayOf } from "./date";
import type { IsoDate, Weekday } from "./date";
import { judgeDay, toBusinessRules } from "./judge";

/** 判定と独立に曜日を求める（Sakamoto の方法。0 = 日曜） */
const SAKAMOTO_TABLE = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4] as const;
const oracleWeekday = (date: IsoDate): Weekday => {
  const [y0 = 0, month = 1, day = 1] = date.split("-").map(Number);
  const year = month < 3 ? y0 - 1 : y0;
  const t = SAKAMOTO_TABLE[month - 1] ?? 0;
  const index =
    (year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400) + t + day) % 7;
  const weekday = WEEKDAYS[index];
  if (weekday === undefined) {
    throw new Error(`unexpected index ${index}`);
  }
  return weekday;
};

/** P4 で「すべての日」として比べる範囲。生成器の範囲に、曜日合わせでずらす分を足す */
const ALL_DAYS: IsoDate[] = (() => {
  const days: IsoDate[] = [];
  for (let date = MIN_DATE; date <= addDays(MAX_DATE, 7); date = addDays(date, 1)) {
    days.push(date);
  }
  return days;
})();

const arbSettingsWithIndex = (
  key: "closedDates" | "specialOpenDates",
): fc.Arbitrary<{ settings: Settings; date: IsoDate }> =>
  arbValidSettings()
    .filter((settings) => settings[key].length > 0)
    .chain((settings) =>
      fc
        .nat({ max: settings[key].length - 1 })
        .map((index) => ({ settings, date: settings[key][index] ?? settings[key][0] ?? MIN_DATE })),
    );

describe("judgeDay（正しさの性質）", () => {
  it("P1（要件 1.3）: 休業日に登録した日は、どの設定でも休業と判定される", () => {
    fc.assert(
      fc.property(arbSettingsWithIndex("closedDates"), ({ settings, date }) => {
        expect(judgeDay(date, toBusinessRules(settings))).toEqual({ open: false, exception: true });
      }),
    );
  });

  it("P2（要件 1.4）: 臨時営業日に登録した日は、どの設定でも営業と判定される", () => {
    fc.assert(
      fc.property(arbSettingsWithIndex("specialOpenDates"), ({ settings, date }) => {
        expect(judgeDay(date, toBusinessRules(settings))).toEqual({ open: true, exception: true });
      }),
    );
  });

  it("P3（要件 1.2、1.5）: 例外がない日は、曜日が営業曜日に含まれるときだけ営業と判定される", () => {
    fc.assert(
      fc.property(arbOpenWeekdays(), arbIsoDate(), (openWeekdays, date) => {
        const rules = toBusinessRules({ openWeekdays, closedDates: [], specialOpenDates: [] });
        const expected = openWeekdays.includes(oracleWeekday(date));
        expect(judgeDay(date, rules)).toEqual({ open: expected, exception: false });
      }),
    );
  });

  it("P4（要件 1.2〜1.4）: 有効な設定に例外を1つ加えて削除すると、すべての日の判定が加える前と一致する", () => {
    fc.assert(
      fc.property(arbValidSettings(), arbIsoDate(), (settings, extra) => {
        fc.pre(!settings.closedDates.includes(extra) && !settings.specialOpenDates.includes(extra));
        const isBusinessDay = settings.openWeekdays.includes(weekdayOf(extra));
        const added: Settings = isBusinessDay
          ? { ...settings, closedDates: [...settings.closedDates, extra] }
          : { ...settings, specialOpenDates: [...settings.specialOpenDates, extra] };
        expect(validateSettings(added).ok).toBe(true);

        const removed: Settings = {
          ...added,
          closedDates: added.closedDates.filter((date) => date !== extra),
          specialOpenDates: added.specialOpenDates.filter((date) => date !== extra),
        };
        const before = toBusinessRules(settings);
        const after = toBusinessRules(removed);
        const mismatched = ALL_DAYS.filter((date) => {
          const a = judgeDay(date, after);
          const b = judgeDay(date, before);
          return a.open !== b.open || a.exception !== b.exception;
        });
        expect(mismatched).toEqual([]);
      }),
    );
  });
});

describe("oracleWeekday（テストの道具）", () => {
  it("should agree with known weekdays", () => {
    expect(oracleWeekday("2026-10-11" as IsoDate)).toBe("sun");
    expect(oracleWeekday("2024-02-29" as IsoDate)).toBe("thu");
    expect(oracleWeekday("2027-01-01" as IsoDate)).toBe("fri");
  });
});
