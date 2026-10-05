import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays } from "../calendar/date";
import { arbCalendarInput, arbInstantOnJstDate } from "../testing/arbitraries";
import { selectToday } from "./selectToday";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 閲覧時刻を日本時間にした日付を、日付の関数と独立に求める */
const jstDateByOffset = (instant: Date): string =>
  new Date(instant.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);

describe("selectToday（正しさの性質）", () => {
  it("P8（要件 4.2、4.4）: 範囲内の任意の閲覧時刻について、閲覧時刻を日本時間にした日付の判定を返す", () => {
    fc.assert(
      fc.property(
        arbCalendarInput().chain(({ data }) =>
          fc.nat({ max: data.days.length - 1 }).chain((index) => {
            const day = data.days[index] ?? data.days[0];
            if (day === undefined) {
              throw new Error("calendar data has no days");
            }
            return arbInstantOnJstDate(day.date).map((viewedAt) => ({ data, day, viewedAt }));
          }),
        ),
        ({ data, day, viewedAt }) => {
          expect(jstDateByOffset(viewedAt)).toBe(day.date);
          expect(selectToday(data, viewedAt)).toEqual({
            kind: "inRange",
            date: day.date,
            open: day.open,
            exception: day.exception,
            businessHours: data.businessHours,
          });
        },
      ),
    );
  });

  it("P8（要件 4.5）: 範囲外の閲覧時刻では outOfRange を返す", () => {
    fc.assert(
      fc.property(
        arbCalendarInput().chain(({ data }) =>
          fc
            .tuple(fc.boolean(), fc.integer({ min: 1, max: 400 }))
            .map(([before, distance]) =>
              before ? addDays(data.range.from, -distance) : addDays(data.range.to, distance),
            )
            .chain((date) =>
              arbInstantOnJstDate(date).map((viewedAt) => ({ data, date, viewedAt })),
            ),
        ),
        ({ data, date, viewedAt }) => {
          expect(selectToday(data, viewedAt)).toEqual({ kind: "outOfRange", date });
        },
      ),
    );
  });
});
