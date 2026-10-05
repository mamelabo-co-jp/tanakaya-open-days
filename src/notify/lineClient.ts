/**
 * LINE Messaging API の broadcast（要件 5.9、6.4、7.1）。
 * 1回だけ送り、再送しない。結果は成功か、エラーの種類（errorCode）だけを返す。
 * トークンは Authorization ヘッダーにだけ使い、エラーやログには含めない。
 */
import type { BroadcastResult } from "./runNotify";

export const LINE_BROADCAST_URL = "https://api.line.me/v2/bot/message/broadcast";
export const DEFAULT_TIMEOUT_MS = 10_000;

type FetchLike = (url: string, init: RequestInit) => Promise<Pick<Response, "status">>;

/** broadcast で送る関数を作る。fetch と打ち切りの時間は差し替えられる（テスト用） */
export const createBroadcast =
  (options: { fetch?: FetchLike; timeoutMs?: number } = {}) =>
  async (token: string, text: string): Promise<BroadcastResult> => {
    const fetchImpl: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetchImpl(LINE_BROADCAST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messages: [{ type: "text", text }] }),
        signal: controller.signal,
      });
      return response.status >= 200 && response.status < 300
        ? { ok: true }
        : { ok: false, errorCode: `HTTP_${response.status}` };
    } catch (error) {
      // 打ち切った場合は、LINE 側で受け付けて届いている可能性がある。再送はしない
      if (controller.signal.aborted) {
        return { ok: false, errorCode: "TIMEOUT" };
      }
      return {
        ok: false,
        errorCode: error instanceof TypeError ? "NETWORK_ERROR" : "UNEXPECTED_ERROR",
      };
    } finally {
      clearTimeout(timer);
    }
  };
