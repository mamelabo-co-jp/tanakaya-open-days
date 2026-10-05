import { GetObjectCommand, type GetObjectCommandInput } from "@aws-sdk/client-s3";
import { GetParameterCommand, type GetParameterCommandInput } from "@aws-sdk/client-ssm";
import { describe, expect, it, vi } from "vitest";

import { buildCalendarData } from "../publish/buildCalendarData";
import { validateSettings } from "../settings/validate";
import {
  FAKE_PAGE_URL,
  FAKE_TOKEN,
  createFakeBroadcast,
  createRecordingLogger,
  fakeBuildMessage,
} from "../testing/fakes";
import type { DynamoCommand } from "./deliveryStore";
import {
  CALENDAR_KEY,
  ConfigurationError,
  InvalidCalendarDataError,
  createNotifyDeps,
  readEnv,
} from "./handler";
import type { AwsClients, NotifyEnv } from "./handler";
import { runNotify } from "./runNotify";

const ENV: NotifyEnv = {
  bucketName: "site-bucket",
  tableName: "deliveries",
  tokenParameterName: "/tanakaya/test/line-channel-access-token",
  pageUrl: FAKE_PAGE_URL,
};

const settings = validateSettings({
  openWeekdays: ["sun"],
  closedDates: [],
  specialOpenDates: [],
  businessHours: { open: "11:00", close: "15:00" },
  notifyTime: "18:00",
});
if (!settings.ok) {
  throw new Error("invalid test settings");
}
const CALENDAR_JSON = JSON.stringify(
  buildCalendarData({ settings: settings.settings, now: new Date("2026-10-05T10:00:00Z") }),
);

const fakeClients = (input: { body?: string; token?: string } = {}) => {
  const s3Inputs: GetObjectCommandInput[] = [];
  const ssmInputs: GetParameterCommandInput[] = [];
  const dynamoCommands: DynamoCommand[] = [];
  const clients: AwsClients = {
    s3: {
      send: async (command: GetObjectCommand) => {
        s3Inputs.push(command.input);
        const body = input.body ?? CALENDAR_JSON;
        return { Body: { transformToString: async () => body } };
      },
    },
    ssm: {
      send: async (command: GetParameterCommand) => {
        ssmInputs.push(command.input);
        return { Parameter: { Value: input.token ?? FAKE_TOKEN } };
      },
    },
    dynamo: {
      send: async (command: DynamoCommand) => {
        dynamoCommands.push(command);
        return {};
      },
    },
  };
  return { clients, s3Inputs, ssmInputs, dynamoCommands };
};

describe("readEnv", () => {
  it("should read all variables", () => {
    expect(
      readEnv({
        BUCKET_NAME: "site-bucket",
        TABLE_NAME: "deliveries",
        LINE_TOKEN_PARAMETER_NAME: "/tanakaya/test/line-channel-access-token",
        PAGE_URL: FAKE_PAGE_URL,
      }),
    ).toEqual(ENV);
  });

  it("should list every missing variable", () => {
    expect(() => readEnv({ BUCKET_NAME: "site-bucket", TABLE_NAME: " " })).toThrow(
      new ConfigurationError(
        "Missing environment variables: TABLE_NAME, LINE_TOKEN_PARAMETER_NAME, PAGE_URL",
      ),
    );
  });

  it("should reject a page URL that is not https", () => {
    expect(() =>
      readEnv({
        BUCKET_NAME: "b",
        TABLE_NAME: "t",
        LINE_TOKEN_PARAMETER_NAME: "/p",
        PAGE_URL: "http://example.com/",
      }),
    ).toThrow(ConfigurationError);
  });
});

describe("createNotifyDeps", () => {
  it("should load calendar.json from the bucket and parse it", async () => {
    const { clients, s3Inputs } = fakeClients();

    const data = await createNotifyDeps({ env: ENV, clients }).loadCalendar();

    expect(s3Inputs).toEqual([{ Bucket: "site-bucket", Key: CALENDAR_KEY }]);
    expect(data.range).toEqual({ from: "2026-10-01", to: "2027-09-30" });
  });

  it.each([
    ["invalid JSON", "{"],
    ["a wrong format", JSON.stringify({ version: 1 })],
  ])("should throw InvalidCalendarDataError for %s", async (_label, body) => {
    const { clients } = fakeClients({ body });

    await expect(createNotifyDeps({ env: ENV, clients }).loadCalendar()).rejects.toThrow(
      InvalidCalendarDataError,
    );
  });

  it("should read the token with decryption from the configured parameter", async () => {
    const { clients, ssmInputs } = fakeClients();

    expect(await createNotifyDeps({ env: ENV, clients }).getToken()).toBe(FAKE_TOKEN);
    expect(ssmInputs).toEqual([
      { Name: "/tanakaya/test/line-channel-access-token", WithDecryption: true },
    ]);
  });

  it("should throw when the parameter has no value", async () => {
    const { clients } = fakeClients({ token: "" });

    await expect(createNotifyDeps({ env: ENV, clients }).getToken()).rejects.toThrow(
      ConfigurationError,
    );
  });

  it("should send once through the wired dependencies without logging the token", async () => {
    const { clients, dynamoCommands } = fakeClients();
    const broadcast = createFakeBroadcast();
    const log = createRecordingLogger();
    // 2026-10-10（土）18:00 JST の実行。対象日は通常営業の 10-11（日）
    const now = vi.fn(() => new Date("2026-10-10T09:00:00.000Z"));

    const outcome = await runNotify(
      createNotifyDeps({
        env: ENV,
        clients,
        overrides: { now, broadcast, log, buildMessage: fakeBuildMessage },
      }),
    );

    expect(outcome).toEqual({ status: "sent", targetDate: "2026-10-11", kind: "regular" });
    expect(broadcast.calls).toHaveLength(1);
    expect(dynamoCommands.map((command) => command.constructor.name)).toEqual([
      "PutItemCommand",
      "UpdateItemCommand",
    ]);
    expect(JSON.stringify(log.entries)).not.toContain(FAKE_TOKEN);
    expect(JSON.stringify(dynamoCommands.map((command) => command.input))).not.toContain(
      FAKE_TOKEN,
    );
  });
});
