import { describe, expect, it, vi } from "vitest";

import { FAKE_TOKEN } from "../testing/fakes";
import { LINE_BROADCAST_URL, createBroadcast } from "./lineClient";

const respondWith = (status: number) => vi.fn(async () => ({ status }));

describe("createBroadcast", () => {
  it("should POST a text message to the broadcast endpoint with the bearer token", async () => {
    const fetch = respondWith(200);

    const result = await createBroadcast({ fetch })(FAKE_TOKEN, "明日は営業します");

    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(LINE_BROADCAST_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${FAKE_TOKEN}`,
    });
    expect(JSON.parse(String(init.body))).toEqual({
      messages: [{ type: "text", text: "明日は営業します" }],
    });
  });

  it.each([
    [429, "HTTP_429"],
    [500, "HTTP_500"],
    [401, "HTTP_401"],
  ])("should return the error code for status %i without retrying", async (status, errorCode) => {
    const fetch = respondWith(status);

    const result = await createBroadcast({ fetch })(FAKE_TOKEN, "text");

    expect(result).toEqual({ ok: false, errorCode });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain(FAKE_TOKEN);
  });

  it("should give up with TIMEOUT when the request does not finish in time", async () => {
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<{ status: number }>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );

    const result = await createBroadcast({ fetch, timeoutMs: 20 })(FAKE_TOKEN, "text");

    expect(result).toEqual({ ok: false, errorCode: "TIMEOUT" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("should return NETWORK_ERROR when fetch fails", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    expect(await createBroadcast({ fetch })(FAKE_TOKEN, "text")).toEqual({
      ok: false,
      errorCode: "NETWORK_ERROR",
    });
  });

  it("should default to a 10 second timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<{ status: number }>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      let settled = false;
      const pending = createBroadcast({ fetch })(FAKE_TOKEN, "text").finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(9_999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ ok: false, errorCode: "TIMEOUT" });
    } finally {
      vi.useRealTimers();
    }
  });
});
