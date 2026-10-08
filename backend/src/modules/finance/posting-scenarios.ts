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
  amount: number | string,
): ScenarioLine => ({
  accountCode,
  side,
  amount: String(amount),
});

export type DeliveryPostingScenario =
  | 'delivered_full'
  | 'delivered_short'
  | 'delivered_unconfirmed'
  | 'later_full_confirmation'
  | 'later_short_confirmation';

export type DeliveryPostingAmounts = {
  cost: string;
  goodsRevenue: string;
  deliveryFee: string;
  due: string;
  collected: string;
  shortfall: string;
};

type DeliveryAmountKey = keyof DeliveryPostingAmounts;
type DeliveryMapLine = Omit<ScenarioLine, 'amount'> & {
  amount: DeliveryAmountKey;
};

/**
 * The phase-3 delivery maps are the single source of truth for both their
 * executable fixtures and live phase-8b postings.
 */
export const DELIVERY_POSTING_MAPS: Readonly<
  Record<DeliveryPostingScenario, readonly DeliveryMapLine[]>
> = {
  delivered_full: [
    { accountCode: '5000', side: 'debit', amount: 'cost' },
    { accountCode: '1020', side: 'debit', amount: 'due' },
    { accountCode: '1010', side: 'credit', amount: 'cost' },
    { accountCode: '4000', side: 'credit', amount: 'goodsRevenue' },
    { accountCode: '4010', side: 'credit', amount: 'deliveryFee' },
  ],
  delivered_short: [
    { accountCode: '5000', side: 'debit', amount: 'cost' },
    { accountCode: '1020', side: 'debit', amount: 'collected' },
    { accountCode: '1040', side: 'debit', amount: 'shortfall' },
    { accountCode: '1010', side: 'credit', amount: 'cost' },
    { accountCode: '4000', side: 'credit', amount: 'goodsRevenue' },
    { accountCode: '4010', side: 'credit', amount: 'deliveryFee' },
  ],
  delivered_unconfirmed: [
    { accountCode: '5000', side: 'debit', amount: 'cost' },
    { accountCode: '1030', side: 'debit', amount: 'due' },
    { accountCode: '1010', side: 'credit', amount: 'cost' },
    { accountCode: '4000', side: 'credit', amount: 'goodsRevenue' },
    { accountCode: '4010', side: 'credit', amount: 'deliveryFee' },
  ],
  later_full_confirmation: [
    { accountCode: '1020', side: 'debit', amount: 'due' },
    { accountCode: '1030', side: 'credit', amount: 'due' },
  ],
  later_short_confirmation: [
    { accountCode: '1020', side: 'debit', amount: 'collected' },
    { accountCode: '1040', side: 'debit', amount: 'shortfall' },
    { accountCode: '1030', side: 'credit', amount: 'due' },
  ],
};

export function materializeDeliveryPosting(
  scenario: DeliveryPostingScenario,
  amounts: DeliveryPostingAmounts,
): ScenarioLine[] {
  return DELIVERY_POSTING_MAPS[scenario]
    .map((item) => line(item.accountCode, item.side, amounts[item.amount]))
    .filter((item) => Number(item.amount) !== 0);
}

export type CustodyExceptionPostingScenario =
  | 'exception_handover'
  | 'exception_loss'
  | 'return_against_uncollected'
  | 'delivery_fee_refund';

export type CustodyExceptionPostingAmounts = {
  resolved: string;
  returnAmount: string;
  exceptionOffset: string;
  refundPayable: string;
  deliveryFee: string;
};

type CustodyExceptionAmountKey = keyof CustodyExceptionPostingAmounts;
type CustodyExceptionMapLine = Omit<ScenarioLine, 'amount'> & {
  amount: CustodyExceptionAmountKey;
};

/** Phase-3 exception maps shared by executable fixtures and phase 8d. */
export const CUSTODY_EXCEPTION_POSTING_MAPS: Readonly<
  Record<CustodyExceptionPostingScenario, readonly CustodyExceptionMapLine[]>
> = {
  exception_handover: [
    { accountCode: '1020', side: 'debit', amount: 'resolved' },
    { accountCode: '1040', side: 'credit', amount: 'resolved' },
  ],
  exception_loss: [
    { accountCode: '5020', side: 'debit', amount: 'resolved' },
    { accountCode: '1040', side: 'credit', amount: 'resolved' },
  ],
  return_against_uncollected: [
    { accountCode: '4100', side: 'debit', amount: 'returnAmount' },
    { accountCode: '1040', side: 'credit', amount: 'exceptionOffset' },
    { accountCode: '2030', side: 'credit', amount: 'refundPayable' },
  ],
  delivery_fee_refund: [
    { accountCode: '4110', side: 'debit', amount: 'deliveryFee' },
    { accountCode: '2030', side: 'credit', amount: 'deliveryFee' },
  ],
};

export function materializeCustodyExceptionPosting(
  scenario: CustodyExceptionPostingScenario,
  amounts: CustodyExceptionPostingAmounts,
): ScenarioLine[] {
  return CUSTODY_EXCEPTION_POSTING_MAPS[scenario]
    .map((item) => line(item.accountCode, item.side, amounts[item.amount]))
    .filter((item) => Number(item.amount) !== 0);
}

const workedDeliveryAmounts: DeliveryPostingAmounts = {
  cost: '60000',
  goodsRevenue: '100000',
  deliveryFee: '5000',
  due: '105000',
  collected: '95000',
  shortfall: '10000',
};

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
    lines: materializeDeliveryPosting('delivered_full', workedDeliveryAmounts),
  },
  {
    key: 'delivered_short',
    event: 'delivery confirmed with a short collection',
    lines: materializeDeliveryPosting('delivered_short', workedDeliveryAmounts),
  },
  {
    key: 'delivered_unconfirmed',
    event: 'delivery with collection awaiting confirmation',
    lines: materializeDeliveryPosting(
      'delivered_unconfirmed',
      workedDeliveryAmounts,
    ),
  },
  {
    key: 'later_full_confirmation',
    event: 'full collection confirmed later without a second sale',
    lines: materializeDeliveryPosting(
      'later_full_confirmation',
      workedDeliveryAmounts,
    ),
  },
  {
    key: 'later_short_confirmation',
    event: 'short collection confirmed later without a second sale',
    lines: materializeDeliveryPosting(
      'later_short_confirmation',
      workedDeliveryAmounts,
    ),
  },
  {
    key: 'exception_handover',
    event: 'missing collection handed over by the party',
    lines: materializeCustodyExceptionPosting('exception_handover', {
      resolved: '10000',
      returnAmount: '0',
      exceptionOffset: '0',
      refundPayable: '0',
      deliveryFee: '0',
    }),
  },
  {
    key: 'exception_loss',
    event: 'collection exception approved as a loss',
    lines: materializeCustodyExceptionPosting('exception_loss', {
      resolved: '10000',
      returnAmount: '0',
      exceptionOffset: '0',
      refundPayable: '0',
      deliveryFee: '0',
    }),
  },
  {
    key: 'cash_received',
    event: 'cash received from the delivery party',
    lines: [line('1050', 'debit', 105_000), line('1020', 'credit', 105_000)],
  },
  {
    key: 'return_against_uncollected',
    event: 'return offsets an open exception before creating a refund',
    lines: materializeCustodyExceptionPosting('return_against_uncollected', {
      resolved: '0',
      returnAmount: '20000',
      exceptionOffset: '10000',
      refundPayable: '10000',
      deliveryFee: '0',
    }),
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
    lines: materializeCustodyExceptionPosting('delivery_fee_refund', {
      resolved: '0',
      returnAmount: '0',
      exceptionOffset: '0',
      refundPayable: '0',
      deliveryFee: '5000',
    }),
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
