import { expect, test } from "@playwright/test";
import { accountDeletionCounts, deletionRefusals } from "../src/lib/account-deletion";

/**
 * The account-deletion refusal (409 ACCOUNT_DELETION_BLOCKED): counts from
 * the structured `details` (contract 17.2), the English messages only as a
 * fallback. Pure rules, run in Node.
 */

const errors = [
  { code: "OPEN_ORDERS", message: "2 open order(s) remain" },
  { code: "UNSETTLED_AMOUNTS", message: "1 unsettled financial record(s) remain" },
];

test("the structured counts win over the messages", () => {
  expect(deletionRefusals({ errors, details: { open_orders: 5, pending_returns: 0, unsettled_amounts: 1 } })).toEqual([
    { reason: "OPEN_ORDERS", count: 5 },
    { reason: "UNSETTLED_AMOUNTS", count: 1 },
  ]);
});

test("a count in details is shown even when its field error is missing", () => {
  expect(deletionRefusals({ errors: [], details: { open_orders: 0, pending_returns: 4, unsettled_amounts: 0 } })).toEqual([
    { reason: "PENDING_RETURNS", count: 4 },
  ]);
});

test("without valid details, the leading number of each message", () => {
  for (const details of [undefined, null, {}, { open_orders: "2", pending_returns: 0, unsettled_amounts: 0 }, { open_orders: -1, pending_returns: 0, unsettled_amounts: 0 }]) {
    expect(deletionRefusals({ errors, details })).toEqual([
      { reason: "OPEN_ORDERS", count: 2 },
      { reason: "UNSETTLED_AMOUNTS", count: 1 },
    ]);
  }
  expect(deletionRefusals({ errors: [{ code: "OPEN_ORDERS", message: "open orders remain" }] })).toEqual([{ reason: "OPEN_ORDERS", count: 0 }]);
});

test("an unknown reason still says something", () => {
  expect(deletionRefusals({ errors: [{ code: "SOMETHING_NEW", message: "x" }] })).toEqual([{ reason: "other", count: 0 }]);
  expect(deletionRefusals({ errors: [], details: { open_orders: 0, pending_returns: 0, unsettled_amounts: 0 } })).toEqual([{ reason: "other", count: 0 }]);
  expect(accountDeletionCounts({ open_orders: 1, pending_returns: 2, unsettled_amounts: 3 })).toEqual({ open_orders: 1, pending_returns: 2, unsettled_amounts: 3 });
});
