import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, toJstDate } from "../calendar/date";
import { arbCalendarInput, arbInstant, arbInstantOnJstDate } from "../testing/arbitraries";
import { planNotification } from "./plan";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

describe("planNotification（正しさの性質）", () => {
  it("P6（要件 5.2）: 対象日は、実行時刻を日本時間にした日付の翌日になる", () => {
    fc.assert(
      fc.property(arbCalendarInput(), arbInstant(), ({ data }, runAt) => {
        // 日付の関数と独立に、UTC+9 の時刻に1日足した UTC の日付として求める
        const expected = new Date(runAt.getTime() + JST_OFFSET_MS + MS_PER_DAY)
          .toISOString()
          .slice(0, 10);
        expect(planNotification(data, runAt).targetDate).toBe(expected);
        expect(toJstDate(runAt)).toBe(
          new Date(runAt.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10),
        );
        expect(planNotification(data, runAt).targetDate).toBe(addDays(toJstDate(runAt), 1));
      }),
    );
  });

  it("要件 5.3〜5.6: 範囲内の対象日の案内の種類は、対象日の値で決まる", () => {
    // 対象日を公開用データの中から選び（例外の日を多めに）、その前日（日本時間）の任意の時刻に実行する
    const arbRunOnDayBefore = arbCalendarInput().chain(({ data }) => {
      const exceptionDays = data.days.filter((day) => day.exception);
      const arbDay = fc.oneof(
        fc.constantFrom(...data.days),
        exceptionDays.length > 0
          ? fc.constantFrom(...exceptionDays)
          : fc.constantFrom(...data.days),
      );
      return arbDay.chain((day) =>
        arbInstantOnJstDate(addDays(day.date, -1)).map((runAt) => ({ data, day, runAt })),
      );
    });
    fc.assert(
      fc.property(arbRunOnDayBefore, ({ data, day, runAt }) => {
        const plan = planNotification(data, runAt);
        expect(plan.targetDate).toBe(day.date);
        if (!day.open && !day.exception) {
          expect(plan).toEqual({ action: "skip", targetDate: day.date });
          return;
        }
        const kind = !day.exception ? "regular" : day.open ? "specialOpen" : "specialClosed";
        expect(plan).toEqual({ action: "send", targetDate: day.date, kind });
      }),
    );
  });
});
