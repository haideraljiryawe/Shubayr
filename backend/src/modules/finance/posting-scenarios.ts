import type { PostingLine } from './ledger.service';

type Side = PostingLine['side'];
export type ScenarioLine = Pick<PostingLine, 'accountCode' | 'side'> & {
  amount: string;
};

export type PostingScenario = {
  key: string;
  event: string;
  lines: ScenarioLine[];
};

const line = (
  accountCode: string,
  side: Side,
  amount: number,
): ScenarioLine => ({
  accountCode,
  side,
  amount: String(amount),
});

/** Executable section 17.1 fixtures using the specification's worked IQD figures. */
export const POSTING_SCENARIOS: readonly PostingScenario[] = [
  {
    key: 'purchase',
    event: 'credit purchase with landed freight',
    lines: [
      line('1000', 'debit', 110_000),
      line('2000', 'credit', 100_000),
      line('2010', 'credit', 10_000),
    ],
  },
  {
    key: 'handover',
    event: 'goods handed to delivery',
    lines: [line('1010', 'debit', 60_000), line('1000', 'credit', 60_000)],
  },
  {
    key: 'delivered_full',
    event: 'full delivery and collection confirmed',
    lines: [
      line('5000', 'debit', 60_000),
      line('1020', 'debit', 105_000),
      line('1010', 'credit', 60_000),
      line('4000', 'credit', 100_000),
      line('4010', 'credit', 5_000),
    ],
  },
  {
    key: 'delivered_short',
    event: 'delivery confirmed with a short collection',
    lines: [
      line('5000', 'debit', 60_000),
      line('1020', 'debit', 95_000),
      line('1040', 'debit', 10_000),
      line('1010', 'credit', 60_000),
      line('4000', 'credit', 100_000),
      line('4010', 'credit', 5_000),
    ],
  },
  {
    key: 'delivered_unconfirmed',
    event: 'delivery with collection awaiting confirmation',
    lines: [
      line('5000', 'debit', 60_000),
      line('1030', 'debit', 105_000),
      line('1010', 'credit', 60_000),
      line('4000', 'credit', 100_000),
      line('4010', 'credit', 5_000),
    ],
  },
  {
    key: 'later_full_confirmation',
    event: 'full collection confirmed later without a second sale',
    lines: [line('1020', 'debit', 105_000), line('1030', 'credit', 105_000)],
  },
  {
    key: 'later_short_confirmation',
    event: 'short collection confirmed later without a second sale',
    lines: [
      line('1020', 'debit', 95_000),
      line('1040', 'debit', 10_000),
      line('1030', 'credit', 105_000),
    ],
  },
  {
    key: 'exception_handover',
    event: 'missing collection handed over by the party',
    lines: [line('1020', 'debit', 10_000), line('1040', 'credit', 10_000)],
  },
  {
    key: 'exception_loss',
    event: 'collection exception approved as a loss',
    lines: [line('5020', 'debit', 10_000), line('1040', 'credit', 10_000)],
  },
  {
    key: 'cash_received',
    event: 'cash received from the delivery party',
    lines: [line('1050', 'debit', 105_000), line('1020', 'credit', 105_000)],
  },
  {
    key: 'return_against_uncollected',
    event: 'return offsets an open exception before creating a refund',
    lines: [
      line('4100', 'debit', 20_000),
      line('1040', 'credit', 10_000),
      line('2030', 'credit', 10_000),
    ],
  },
  {
    key: 'refund_payment',
    event: 'customer refund paid',
    lines: [line('2030', 'debit', 10_000), line('1050', 'credit', 10_000)],
  },
  {
    key: 'restock_issue_cost',
    event: 'sellable return restocked at original issue cost',
    lines: [line('1000', 'debit', 12_000), line('5000', 'credit', 12_000)],
  },
  {
    key: 'delivery_fee_refund',
    event: 'delivery fee refunded as its own line',
    lines: [line('4110', 'debit', 5_000), line('2030', 'credit', 5_000)],
  },
  {
    key: 'supplier_fx_loss',
    event: 'supplier debt paid with realised FX loss',
    lines: [
      line('2000', 'debit', 60_000),
      line('5030', 'debit', 2_000),
      line('1050', 'credit', 62_000),
    ],
  },
  {
    key: 'supplier_fx_gain',
    event: 'supplier debt paid with realised FX gain',
    lines: [
      line('2000', 'debit', 60_000),
      line('1050', 'credit', 58_000),
      line('4020', 'credit', 2_000),
    ],
  },
  {
    key: 'wage_accrual',
    event: 'delivery wage or store-paid fare accrued',
    lines: [line('5040', 'debit', 3_000), line('2020', 'credit', 3_000)],
  },
  {
    key: 'wage_payment',
    event: 'delivery wage paid',
    lines: [line('2020', 'debit', 3_000), line('1050', 'credit', 3_000)],
  },
  {
    key: 'netting',
    event: 'approved fare netted against delivery cash custody',
    lines: [line('2020', 'debit', 3_000), line('1020', 'credit', 3_000)],
  },
  {
    key: 'count_shortage',
    event: 'inventory count shortage',
    lines: [line('5010', 'debit', 7_500), line('1000', 'credit', 7_500)],
  },
  {
    key: 'count_surplus',
    event: 'inventory count surplus',
    lines: [line('1000', 'debit', 7_500), line('5011', 'credit', 7_500)],
  },
  {
    key: 'expense_approval',
    event: 'operating expense approved in its accrual period',
    lines: [line('5050', 'debit', 300_000), line('2040', 'credit', 300_000)],
  },
  {
    key: 'expense_payment_partial',
    event: 'part of an approved expense paid',
    lines: [line('2040', 'debit', 100_000), line('1050', 'credit', 100_000)],
  },
  {
    key: 'expense_payment_remainder',
    event: 'remaining approved expense paid later',
    lines: [line('2040', 'debit', 200_000), line('1050', 'credit', 200_000)],
  },
] as const;
