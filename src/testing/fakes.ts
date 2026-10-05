/**
 * 配信処理のテスト用の偽物。テストからだけ使う。本番のコードから import しない。
 */
import type { IsoDate } from "../calendar/date";
import type { LogFields, Logger } from "../notify/logger";
import type { MessageInput } from "../notify/message";
import type { NoticeKind } from "../notify/plan";
import type { BroadcastResult, DeliveryRecordStore, NotifyDeps } from "../notify/runNotify";
import type { CalendarData } from "../publish/buildCalendarData";

export type StoredRecord = {
  status: "sending" | "sent" | "failed";
  kind: NoticeKind;
  errorCode?: string;
};

/**
 * DynamoDB の条件付き書き込みを Map で再現した配信記録。
 * 確認と書き込みの間に await を挟まない（DynamoDB と同じく1件の書き込みとして不可分にする）。
 * 呼び出しの前に await を1回挟み、並行実行の順番が入れ替わるようにする。
 */
export const createMemoryRecordStore = (): DeliveryRecordStore & {
  records: Map<IsoDate, StoredRecord>;
} => {
  const records = new Map<IsoDate, StoredRecord>();
  return {
    records,
    tryCreate: async ({ targetDate, kind }) => {
      await Promise.resolve();
      if (records.has(targetDate)) {
        return "exists";
      }
      records.set(targetDate, { status: "sending", kind });
      return "created";
    },
    markSent: async (targetDate) => {
      await Promise.resolve();
      const record = records.get(targetDate);
      if (record !== undefined) {
        records.set(targetDate, { ...record, status: "sent" });
      }
    },
    markFailed: async (targetDate, _at, errorCode) => {
      await Promise.resolve();
      const record = records.get(targetDate);
      if (record !== undefined) {
        records.set(targetDate, { ...record, status: "failed", errorCode });
      }
    },
  };
};

export type LogEntry = { level: "info" | "error"; message: string; fields: LogFields };

/** 出力を配列に溜めるロガー */
export const createRecordingLogger = (): Logger & { entries: LogEntry[] } => {
  const entries: LogEntry[] = [];
  return {
    entries,
    info: (message, fields = {}) => {
      entries.push({ level: "info", message, fields });
    },
    error: (message, fields = {}) => {
      entries.push({ level: "error", message, fields });
    },
  };
};

export const FAKE_TOKEN = "fake-channel-access-token-for-tests";
export const FAKE_PAGE_URL = "https://example.cloudfront.net/";

/** 送信の呼び出しを数える偽物。結果は results の順に返し、尽きたら成功を返す */
export const createFakeBroadcast = (
  results: BroadcastResult[] = [],
): NotifyDeps["broadcast"] & { calls: Array<{ token: string; text: string }> } => {
  const calls: Array<{ token: string; text: string }> = [];
  const queue = [...results];
  const broadcast = async (token: string, text: string): Promise<BroadcastResult> => {
    await Promise.resolve();
    calls.push({ token, text });
    return queue.shift() ?? { ok: true };
  };
  return Object.assign(broadcast, { calls });
};

/** 4.4 の実装を待たずに使う、テスト用の文面 */
export const fakeBuildMessage = (input: MessageInput): string =>
  `[${input.kind}] ${input.targetDate} ${input.pageUrl}`;

/** 既定の偽物を組み合わせた NotifyDeps。overrides で一部を差し替える */
export const createFakeDeps = (input: {
  data: CalendarData;
  now: Date;
  overrides?: Partial<NotifyDeps>;
}): NotifyDeps => ({
  now: () => input.now,
  loadCalendar: async () => input.data,
  records: createMemoryRecordStore(),
  getToken: async () => FAKE_TOKEN,
  broadcast: createFakeBroadcast(),
  buildMessage: fakeBuildMessage,
  pageUrl: FAKE_PAGE_URL,
  log: createRecordingLogger(),
  ...input.overrides,
});
