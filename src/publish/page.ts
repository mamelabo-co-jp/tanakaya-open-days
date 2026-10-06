/**
 * 公開ページのブラウザ用の入口（要件4）。esbuild で dist/site/app.js にまとめる。
 * calendar.json を読み、buildPageView の結果を DOM に描く。文字は textContent で入れ、
 * innerHTML は使わない。
 */
import { WEEKDAY_LABEL_LIST } from "../calendar/format";
import { parseCalendarData } from "./buildCalendarData";
import type { CalendarData } from "./buildCalendarData";
import { buildPageView } from "./pageView";
import type { MonthPageView, TodayPageView } from "./pageView";

const CALENDAR_URL = "calendar.json";

const loadCalendar = async (): Promise<CalendarData | null> => {
  try {
    const response = await fetch(CALENDAR_URL, { cache: "no-cache" });
    if (!response.ok) {
      return null;
    }
    return parseCalendarData(await response.json());
  } catch {
    return null;
  }
};

const element = <TTag extends keyof HTMLElementTagNameMap>(
  tag: TTag,
  options: { text?: string; className?: string } = {},
): HTMLElementTagNameMap[TTag] => {
  const node = document.createElement(tag);
  if (options.text !== undefined) {
    node.textContent = options.text;
  }
  if (options.className !== undefined) {
    node.className = options.className;
  }
  return node;
};

const byId = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (node === null) {
    throw new Error(`Element not found: #${id}`);
  }
  return node;
};

const renderToday = (today: TodayPageView): void => {
  byId("today-date").textContent = today.dateLabel;
  const status = byId("today-status");
  const hours = byId("today-hours");
  if (today.kind === "unavailable") {
    status.textContent = today.message;
    status.className = "status status-unavailable";
    hours.textContent = "";
    return;
  }
  status.textContent = today.statusLabel;
  status.className = `status status-${today.dayKind}`;
  hours.textContent = today.hoursLabel === null ? "" : `営業時間 ${today.hoursLabel}`;
};

const renderMonth = (month: MonthPageView): HTMLTableElement => {
  const table = element("table", { className: "month" });
  table.append(element("caption", { text: month.caption }));
  const headRow = element("tr");
  for (const label of WEEKDAY_LABEL_LIST) {
    const th = element("th", { text: label });
    th.scope = "col";
    headRow.append(th);
  }
  const head = element("thead");
  head.append(headRow);
  table.append(head);
  const body = element("tbody");
  for (const week of month.weeks) {
    const row = element("tr");
    for (const cell of week) {
      const td = element("td");
      if (cell !== null) {
        td.className = `day day-${cell.dayKind}`;
        td.append(element("span", { text: String(cell.day), className: "day-number" }));
        td.append(element("span", { text: cell.mark, className: "day-mark" }));
        if (cell.isToday) {
          td.setAttribute("aria-current", "date");
        }
      }
      row.append(td);
    }
    body.append(row);
  }
  table.append(body);
  return table;
};

const render = (data: CalendarData | null): void => {
  const view = buildPageView(data, new Date());
  renderToday(view.today);
  byId("months").replaceChildren(...view.months.map(renderMonth));
};

const start = async (): Promise<void> => {
  render(await loadCalendar());
};

void start();
