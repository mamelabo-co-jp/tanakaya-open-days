import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateSettings } from "./validate";

const EXAMPLE_PATH = new URL("../../data/settings.example.json", import.meta.url);

describe("data/settings.example.json（要件 2.10）", () => {
  const raw: unknown = JSON.parse(readFileSync(EXAMPLE_PATH, "utf8"));

  it("should pass the settings validation", () => {
    expect(validateSettings(raw)).toMatchObject({ ok: true });
  });

  it("should set Sunday as the only business weekday", () => {
    const result = validateSettings(raw);
    expect(result.ok ? result.settings.openWeekdays : null).toEqual(["sun"]);
  });
});
