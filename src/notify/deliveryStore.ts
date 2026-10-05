/**
 * 配信記録（DynamoDB）。要件 6.2、6.6。
 * 対象日をパーティションキーにし、同じ対象日の記録がないときだけ作る条件付き書き込みで、
 * 二重配信を防ぐ。記録にはトークンや文面を入れない。
 */
import { PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

import type { IsoDate } from "../calendar/date";
import type { NoticeKind } from "./plan";
import type { DeliveryRecordStore } from "./runNotify";

/** 記録を残す日数（TTL） */
export const RECORD_TTL_DAYS = 400;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DynamoCommand = PutItemCommand | UpdateItemCommand;

/** DynamoDBClient の send だけを使う（テストで差し替えるため） */
export type DynamoSender = { send: (command: DynamoCommand) => Promise<unknown> };

const isConditionalCheckFailed = (error: unknown): boolean =>
  error instanceof Error && error.name === "ConditionalCheckFailedException";

const putIfAbsent = (input: {
  tableName: string;
  targetDate: IsoDate;
  kind: NoticeKind;
  at: Date;
}): PutItemCommand => {
  const { tableName, targetDate, kind, at } = input;
  const timestamp = at.toISOString();
  return new PutItemCommand({
    TableName: tableName,
    Item: {
      targetDate: { S: targetDate },
      status: { S: "sending" },
      kind: { S: kind },
      createdAt: { S: timestamp },
      updatedAt: { S: timestamp },
      expiresAt: { N: String(Math.floor((at.getTime() + RECORD_TTL_DAYS * MS_PER_DAY) / 1000)) },
    },
    ConditionExpression: "attribute_not_exists(targetDate)",
  });
};

const updateStatus = (input: {
  tableName: string;
  targetDate: IsoDate;
  at: Date;
  status: "sent" | "failed";
  errorCode?: string;
}): UpdateItemCommand => {
  const { tableName, targetDate, at, status, errorCode } = input;
  const withError = errorCode !== undefined;
  return new UpdateItemCommand({
    TableName: tableName,
    Key: { targetDate: { S: targetDate } },
    UpdateExpression: withError
      ? "SET #status = :status, updatedAt = :updatedAt, errorCode = :errorCode"
      : "SET #status = :status, updatedAt = :updatedAt",
    ConditionExpression: "attribute_exists(targetDate)",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": { S: status },
      ":updatedAt": { S: at.toISOString() },
      ...(withError ? { ":errorCode": { S: errorCode } } : {}),
    },
  });
};

/** DynamoDB の配信記録を作る */
export const createDeliveryRecordStore = (options: {
  client: DynamoSender;
  tableName: string;
}): DeliveryRecordStore => {
  const { client, tableName } = options;
  return {
    tryCreate: async ({ targetDate, kind, at }) => {
      try {
        await client.send(putIfAbsent({ tableName, targetDate, kind, at }));
        return "created";
      } catch (error) {
        if (isConditionalCheckFailed(error)) {
          return "exists";
        }
        throw error;
      }
    },
    markSent: async (targetDate, at) => {
      await client.send(updateStatus({ tableName, targetDate, at, status: "sent" }));
    },
    markFailed: async (targetDate, at, errorCode) => {
      await client.send(updateStatus({ tableName, targetDate, at, status: "failed", errorCode }));
    },
  };
};
