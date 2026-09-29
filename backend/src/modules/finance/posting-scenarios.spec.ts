import {
  POSTING_SCENARIOS,
  PostingScenario,
  ScenarioLine,
} from './posting-scenarios';

function totals(lines: readonly ScenarioLine[]) {
  return lines.reduce(
    (result, line) => {
      result[line.side] += BigInt(line.amount);
      return result;
    },
    { debit: 0n, credit: 0n },
  );
}

function net(...keys: string[]) {
  const result = new Map<string, bigint>();
  for (const key of keys) {
    const scenario = POSTING_SCENARIOS.find((item) => item.key === key);
    if (!scenario) throw new Error(`Missing scenario ${key}`);
    for (const line of scenario.lines) {
      const signed =
        line.side === 'debit' ? BigInt(line.amount) : -BigInt(line.amount);
      result.set(
        line.accountCode,
        (result.get(line.accountCode) ?? 0n) + signed,
      );
    }
  }
  return Object.fromEntries(
    [...result.entries()].filter(([, amount]) => amount !== 0n).sort(),
  );
}

describe('section 17.1 posting fixtures', () => {
  it.each(POSTING_SCENARIOS)(
    '$key balances in exact base-currency units',
    (scenario) => {
      const { debit, credit } = totals(scenario.lines);
      expect(debit).toBe(credit);
      expect(debit).toBeGreaterThan(0n);
    },
  );

  it('covers every worked scenario and sub-step', () => {
    expect(POSTING_SCENARIOS).toHaveLength(24);
    expect(
      new Set(POSTING_SCENARIOS.map((scenario) => scenario.key)).size,
    ).toBe(24);
  });

  it('later full confirmation reconciles to the direct full-collection entry', () => {
    expect(net('delivered_unconfirmed', 'later_full_confirmation')).toEqual(
      net('delivered_full'),
    );
  });

  it('later short confirmation reconciles to the direct short-collection entry', () => {
    expect(net('delivered_unconfirmed', 'later_short_confirmation')).toEqual(
      net('delivered_short'),
    );
  });

  it('handover of a shortfall reconciles a short collection to a full collection', () => {
    expect(net('delivered_short', 'exception_handover')).toEqual(
      net('delivered_full'),
    );
  });

  it('expense approval and both payments clear the payable without duplicating expense', () => {
    expect(
      net(
        'expense_approval',
        'expense_payment_partial',
        'expense_payment_remainder',
      ),
    ).toEqual({ '1050': -300_000n, '5050': 300_000n });
  });

  it('uses only accounts in the seeded section 17.1 chart', () => {
    const seeded = new Set([
      '1000',
      '1010',
      '1020',
      '1030',
      '1040',
      '1050',
      '2000',
      '2010',
      '2020',
      '2030',
      '2040',
      '4000',
      '4010',
      '4020',
      '4100',
      '4110',
      '5000',
      '5010',
      '5011',
      '5020',
      '5030',
      '5040',
      '5050',
    ]);
    expect(
      POSTING_SCENARIOS.flatMap((scenario: PostingScenario) => scenario.lines)
        .map((line) => line.accountCode)
        .every((code) => seeded.has(code)),
    ).toBe(true);
  });
});
