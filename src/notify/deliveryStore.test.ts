import {
  ConditionalCheckFailedException,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { describe, expect, it, vi } from "vitest";

import { isoDateOf } from "../calendar/date";
import { RECORD_TTL_DAYS, createDeliveryRecordStore } from "./deliveryStore";
import type { DynamoCommand } from "./deliveryStore";

const TARGET = isoDateOf(2026, 10, 11);
const AT = new Date("2026-10-10T09:00:00.000Z");

const storeWith = (send: (command: DynamoCommand) => Promise<unknown>) =>
  createDeliveryRecordStore({ client: { send }, tableName: "deliveries" });

describe("createDeliveryRecordStore", () => {
  describe("tryCreate（要件 6.2、6.3）", () => {
    it("should put a 'sending' record only when no record exists for the target date", async () => {
      const send = vi.fn<(command: DynamoCommand) => Promise<unknown>>(async () => ({}));

      expect(await storeWith(send).tryCreate({ targetDate: TARGET, kind: "regular", at: AT })).toBe(
        "created",
      );

      const command = send.mock.calls[0]?.[0] as unknown;
      expect(command).toBeInstanceOf(PutItemCommand);
      const input = (command as PutItemCommand).input;
      expect(input.TableName).toBe("deliveries");
      expect(input.ConditionExpression).toBe("attribute_not_exists(targetDate)");
      expect(input.Item).toEqual({
        targetDate: { S: "2026-10-11" },
        status: { S: "sending" },
        kind: { S: "regular" },
        createdAt: { S: "2026-10-10T09:00:00.000Z" },
        updatedAt: { S: "2026-10-10T09:00:00.000Z" },
        expiresAt: { N: String(Math.floor(AT.getTime() / 1000) + RECORD_TTL_DAYS * 86_400) },
      });
    });

    it("should return 'exists' when the conditional check fails", async () => {
      const send = vi.fn(async () => {
        throw new ConditionalCheckFailedException({
          message: "The conditional request failed",
          $metadata: {},
        });
      });

      expect(await storeWith(send).tryCreate({ targetDate: TARGET, kind: "regular", at: AT })).toBe(
        "exists",
      );
    });

    it("should rethrow other errors", async () => {
      const error = Object.assign(new Error("throttled"), {
        name: "ProvisionedThroughputExceededException",
      });
      const send = vi.fn(async () => {
        throw error;
      });

      await expect(
        storeWith(send).tryCreate({ targetDate: TARGET, kind: "regular", at: AT }),
      ).rejects.toBe(error);
    });
  });

  describe("markSent / markFailed（要件 6.4、6.6）", () => {
    it("should set the status to sent on the existing record", async () => {
      const send = vi.fn<(command: DynamoCommand) => Promise<unknown>>(async () => ({}));

      await storeWith(send).markSent(TARGET, AT);

      const command = send.mock.calls[0]?.[0] as unknown;
      expect(command).toBeInstanceOf(UpdateItemCommand);
      const input = (command as UpdateItemCommand).input;
      expect(input.Key).toEqual({ targetDate: { S: "2026-10-11" } });
      expect(input.ConditionExpression).toBe("attribute_exists(targetDate)");
      expect(input.ExpressionAttributeValues?.[":status"]).toEqual({ S: "sent" });
      expect(input.UpdateExpression).not.toContain("errorCode");
    });

    it("should set the status to failed with the error code", async () => {
      const send = vi.fn<(command: DynamoCommand) => Promise<unknown>>(async () => ({}));

      await storeWith(send).markFailed(TARGET, AT, "HTTP_429");

      const input = (send.mock.calls[0]?.[0] as unknown as UpdateItemCommand).input;
      expect(input.ExpressionAttributeValues?.[":status"]).toEqual({ S: "failed" });
      expect(input.ExpressionAttributeValues?.[":errorCode"]).toEqual({ S: "HTTP_429" });
    });
  });
});
