/**
 * 前日配信の Lambda の入口（要件 5、6、7）。
 * AWS SDK で実体を作って runNotify に渡すだけにする。判断はすべて runNotify と純粋関数で行う。
 *
 * 環境変数（template.yaml で設定する）:
 *   BUCKET_NAME                公開ページの S3 バケット（calendar.json を読む）
 *   TABLE_NAME                 配信記録の DynamoDB テーブル
 *   LINE_TOKEN_PARAMETER_NAME  チャネルアクセストークンを置いた SSM パラメータの名前（要件 7.2）
 *   PAGE_URL                   公開ページの URL（案内の文面に入れる）
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

import { parseCalendarData } from "../publish/buildCalendarData";
import type { CalendarData } from "../publish/buildCalendarData";
import { createDeliveryRecordStore } from "./deliveryStore";
import type { DynamoSender } from "./deliveryStore";
import { createBroadcast } from "./lineClient";
import { createConsoleLogger } from "./logger";
import { buildMessage } from "./message";
import { runNotify } from "./runNotify";
import type { NotifyDeps, NotifyOutcome } from "./runNotify";

/** 公開用データのオブジェクトキー */
export const CALENDAR_KEY = "calendar.json";

/** 環境変数や SSM パラメータの設定が足りないときのエラー */
export class ConfigurationError extends Error {
  override readonly name = "ConfigurationError";
}

/** S3 の公開用データが読めない、または形が正しくないときのエラー */
export class InvalidCalendarDataError extends Error {
  override readonly name = "InvalidCalendarDataError";
}

export type NotifyEnv = {
  bucketName: string;
  tableName: string;
  tokenParameterName: string;
  pageUrl: string;
};

const ENV_NAMES = {
  bucketName: "BUCKET_NAME",
  tableName: "TABLE_NAME",
  tokenParameterName: "LINE_TOKEN_PARAMETER_NAME",
  pageUrl: "PAGE_URL",
} as const satisfies Record<keyof NotifyEnv, string>;

/** 環境変数を読む。足りないものはまとめてエラーにする */
export const readEnv = (env: Record<string, string | undefined>): NotifyEnv => {
  const missing = Object.values(ENV_NAMES).filter((name) => (env[name] ?? "").trim() === "");
  if (missing.length > 0) {
    throw new ConfigurationError(`Missing environment variables: ${missing.join(", ")}`);
  }
  const value = (key: keyof NotifyEnv): string => (env[ENV_NAMES[key]] ?? "").trim();
  const pageUrl = value("pageUrl");
  if (!pageUrl.startsWith("https://")) {
    throw new ConfigurationError(`${ENV_NAMES.pageUrl} must start with https://`);
  }
  return {
    bucketName: value("bucketName"),
    tableName: value("tableName"),
    tokenParameterName: value("tokenParameterName"),
    pageUrl,
  };
};

type S3Sender = {
  send: (
    command: GetObjectCommand,
  ) => Promise<{ Body?: { transformToString: () => Promise<string> } }>;
};
type SsmSender = {
  send: (command: GetParameterCommand) => Promise<{ Parameter?: { Value?: string } }>;
};

export type AwsClients = { s3: S3Sender; dynamo: DynamoSender; ssm: SsmSender };

const loadCalendarFrom = async (s3: S3Sender, bucketName: string): Promise<CalendarData> => {
  const output = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: CALENDAR_KEY }));
  const body = await output.Body?.transformToString();
  if (body === undefined) {
    throw new InvalidCalendarDataError(`${CALENDAR_KEY} has no body`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    throw new InvalidCalendarDataError(`${CALENDAR_KEY} is not valid JSON`);
  }
  const data = parseCalendarData(raw);
  if (data === null) {
    throw new InvalidCalendarDataError(`${CALENDAR_KEY} does not match the calendar data format`);
  }
  return data;
};

const readToken = async (ssm: SsmSender, parameterName: string): Promise<string> => {
  const output = await ssm.send(
    new GetParameterCommand({ Name: parameterName, WithDecryption: true }),
  );
  const token = output.Parameter?.Value ?? "";
  if (token === "") {
    // パラメータの名前は出してよい。値は出さない
    throw new ConfigurationError(`SSM parameter has no value: ${parameterName}`);
  }
  return token;
};

/** 環境変数と AWS のクライアントから NotifyDeps を作る。overrides はテスト用 */
export const createNotifyDeps = (input: {
  env: NotifyEnv;
  clients: AwsClients;
  overrides?: Partial<NotifyDeps>;
}): NotifyDeps => {
  const { env, clients, overrides } = input;
  return {
    now: () => new Date(),
    loadCalendar: () => loadCalendarFrom(clients.s3, env.bucketName),
    records: createDeliveryRecordStore({ client: clients.dynamo, tableName: env.tableName }),
    getToken: () => readToken(clients.ssm, env.tokenParameterName),
    broadcast: createBroadcast(),
    buildMessage,
    pageUrl: env.pageUrl,
    log: createConsoleLogger(),
    ...overrides,
  };
};

let defaultClients: AwsClients | undefined;

const getDefaultClients = (): AwsClients => {
  defaultClients ??= {
    s3: new S3Client({}),
    dynamo: new DynamoDBClient({}),
    ssm: new SSMClient({}),
  };
  return defaultClients;
};

/** EventBridge Scheduler から起動される。入力イベントは使わない */
export const handler = async (): Promise<NotifyOutcome> =>
  runNotify(createNotifyDeps({ env: readEnv(process.env), clients: getDefaultClients() }));
