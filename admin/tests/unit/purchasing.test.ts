import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  agingTotals,
  allocateLanded,
  baseQuantityError,
  correctionSplit,
  daysBefore,
  displayShares,
  documentDateProblem,
  fixedText,
  fx,
  isMissingRate,
  isRateOverrideForbidden,
  isSeparationOfDuties,
  landedUnitCostIqd,
  moneyText,
  packConversion,
  paymentPreview,
  settlementCurrency,
  settlingAmount,
  purchasingSourceHref,
  returnPreview,
  toFixed,
  unitDifferences,
  type CurrencyCode,
} from "@/lib/purchasing";

const n = (value: string | number) => toFixed(value);
const text = (value: bigint, digits?: number) => fixedText(value, digits);

describe("fixed-point decimals", () => {
  it("parses and prints exactly", () => {
    expect(text(n("1500"))).toBe("1500");
    expect(text(n("0.1") + n("0.2"))).toBe("0.3");
    expect(text(n("-3.5"))).toBe("-3.5");
    expect(text(n(13333.333333333332))).toBe("13333.333333333332");
    expect(text(fx.mul(n("2.5"), n("1500")))).toBe("3750");
    expect(text(fx.div(n("20000"), n("3")), 4)).toBe("6666.6667");
    expect(text(n(""))).toBe("0");
  });
});

describe("purchase invoice", () => {
  it("converts packs: 2 × 12 at 60,000 a pack is 24 units at 5,000", () => {
    const line = packConversion("2", "12", "60000");
    expect(text(line.baseQuantity)).toBe("24");
    expect(text(line.baseUnitCost)).toBe("5000");
    expect(text(line.lineTotal)).toBe("120000");
  });

  it("checks base quantities against the SKU's unit rule", () => {
    expect(baseQuantityError(packConversion("2.5", "1", "1").baseQuantity, true)).toBe("wholeUnits");
    expect(baseQuantityError(packConversion("2.5", "1", "1").baseQuantity, false)).toBeNull();
    expect(baseQuantityError(n("1.2345"), false)).toBe("decimals");
    expect(baseQuantityError(packConversion("0.5", "4", "1").baseQuantity, true)).toBeNull();
  });

  it("allocates 20,000 of landed cost by value, summing exactly (the server's rule)", () => {
    const lines = [
      { value: n("120000"), quantity: n("24") },
      { value: n("60000"), quantity: n("6") },
    ];
    const { shares, error } = allocateLanded(lines, n("20000"), "value");
    expect(error).toBeNull();
    // Same figures the API stored for this example.
    expect(text(shares[0]!)).toBe("13333.333333333333");
    expect(text(shares[1]!)).toBe("6666.666666666667");
    expect(shares[0]! + shares[1]!).toBe(n("20000"));
    expect(displayShares(shares, 0).map((share) => text(share))).toEqual(["13333", "6667"]);
    expect(text(landedUnitCostIqd(n("5000"), n("1"), shares[0]!, n("24")), 6)).toBe("5555.555556");
  });

  it("allocates by quantity and by hand", () => {
    const lines = [
      { value: n("100"), quantity: n("1"), manual: n("5") },
      { value: n("100"), quantity: n("2"), manual: n("5") },
    ];
    expect(allocateLanded(lines, n("30"), "quantity").shares.map((share) => text(share))).toEqual(["10", "20"]);
    expect(allocateLanded(lines, n("10"), "manual").error).toBeNull();
    expect(allocateLanded(lines, n("11"), "manual").error).toBe("manualMismatch");
    expect(allocateLanded([{ value: 0n, quantity: 0n }], n("1"), "value").error).toBe("zeroBase");
    expect(allocateLanded(lines, 0n, "value").shares).toEqual([0n, 0n]);
  });

  it("keeps displayed shares summing to the total when rounding three ways", () => {
    const thirds = allocateLanded(
      [1, 1, 1].map(() => ({ value: n("1"), quantity: n("1") })),
      n("100"),
      "value",
    ).shares;
    const shown = displayShares(thirds, 0);
    expect(shown.map((share) => text(share))).toEqual(["33", "33", "34"]);
    expect(shown.reduce((a, b) => a + b, 0n)).toBe(n("100"));
  });
});

describe("document dates", () => {
  const options = { windowDays: 90, canBackdate: false, reason: "" };
  it("refuses future dates and old dates without backdate.approve", () => {
    expect(daysBefore("2026-07-03", "2026-10-01")).toBe(90);
    expect(documentDateProblem("2026-10-02", "2026-10-01", options)).toBe("future");
    expect(documentDateProblem("2026-07-03", "2026-10-01", options)).toBeNull();
    expect(documentDateProblem("2026-07-02", "2026-10-01", options)).toBe("needsBackdateApproval");
    expect(documentDateProblem("2026-07-02", "2026-10-01", { ...options, canBackdate: true })).toBe("needsBackdateReason");
    expect(documentDateProblem("2026-07-02", "2026-10-01", { ...options, canBackdate: true, reason: "Late paperwork" })).toBeNull();
    expect(documentDateProblem("nope", "2026-10-01", options)).toBe("invalid");
  });
});

describe("supplier payments (API 10.0.1: amounts in the payment currency)", () => {
  // USD 100 × 2 bought at 1,500 = 300,000 IQD carried.
  const usdInvoice = { invoiceId: "inv", invoiceCurrency: "USD" as const, bookedRate: n("1500"), remaining: n("200") };

  it("same currency: an FX loss when paid at 1,520", () => {
    const preview = paymentPreview({ currency: "USD", amount: n("100"), settlementRate: n("1520"), allocations: [{ ...usdInvoice, amount: n("100") }] });
    const row = preview.rows[0]!;
    expect(row.converted).toBe(false);
    expect(text(row.applied)).toBe("100");
    expect(text(row.carryingIqd)).toBe("150000");
    expect(text(row.paidIqd)).toBe("152000");
    expect(text(preview.fxIqd)).toBe("2000");
    expect(preview.unallocatedIqd).toBe(0n);
  });

  it("same currency: an FX gain at 1,480, and the overpayment stays a credit", () => {
    const preview = paymentPreview({ currency: "USD", amount: n("120"), settlementRate: n("1480"), allocations: [{ ...usdInvoice, amount: n("100") }] });
    expect(text(preview.fxIqd)).toBe("-2000");
    expect(text(preview.unallocatedIqd)).toBe("29600");
    expect(text(preview.creditCurrency)).toBe("20");
    expect(preview.overAllocated).toBe(false);
  });

  it("USD invoice 200 @ 1,500 paid from IQD 304,000 at 1,520: settled, FX loss 4,000", () => {
    const preview = paymentPreview({ currency: "IQD", amount: n("304000"), settlementRate: n("1520"), allocations: [{ ...usdInvoice, amount: n("304000") }] });
    const row = preview.rows[0]!;
    expect(row.converted).toBe(true);
    expect(text(row.invoiceRate)).toBe("1520");
    expect(text(row.applied)).toBe("200");
    expect(row.overRemaining).toBe(false);
    expect(text(row.carryingIqd)).toBe("300000");
    expect(text(row.paidIqd)).toBe("304000");
    expect(text(preview.fxIqd)).toBe("4000");
    expect(text(preview.amountIqd)).toBe("304000");
    expect(preview.creditCurrency).toBe(0n);
  });

  it("a partial cross-currency allocation: 76,000 IQD at 1,520 applies 50 USD", () => {
    const preview = paymentPreview({ currency: "IQD", amount: n("76000"), settlementRate: n("1520"), allocations: [{ ...usdInvoice, amount: n("76000") }] });
    expect(text(preview.rows[0]!.applied)).toBe("50");
    expect(text(preview.fxIqd)).toBe("1000");
  });

  it("an IQD invoice paid from USD: 100 USD at 1,520 settles 152,000 IQD with no FX", () => {
    const preview = paymentPreview({
      currency: "USD",
      amount: n("100"),
      settlementRate: n("1520"),
      allocations: [{ invoiceId: "iqd", invoiceCurrency: "IQD", bookedRate: n("1"), remaining: n("152000"), amount: n("100") }],
    });
    const row = preview.rows[0]!;
    expect(row.converted).toBe(true);
    expect(text(row.invoiceRate)).toBe("1");
    expect(text(row.applied)).toBe("152000");
    expect(preview.fxIqd).toBe(0n);
    expect(text(preview.amountIqd)).toBe("152000");
  });

  it("flags an allocation beyond the invoice balance and one beyond the payment", () => {
    const over = paymentPreview({ currency: "IQD", amount: n("400000"), settlementRate: n("1520"), allocations: [{ ...usdInvoice, amount: n("305520") }] });
    expect(text(over.rows[0]!.applied)).toBe("201");
    expect(over.rows[0]!.overRemaining).toBe(true);
    const iqd = paymentPreview({
      currency: "IQD",
      amount: n("1000"),
      settlementRate: 0n,
      allocations: [{ invoiceId: "a", invoiceCurrency: "IQD", bookedRate: n("1"), remaining: n("5000"), amount: n("1200") }],
    });
    expect(iqd.fxIqd).toBe(0n);
    expect(iqd.overAllocated).toBe(true);
  });

  it("converts to six decimals, as the server posts", () => {
    const preview = paymentPreview({ currency: "IQD", amount: n("1000"), settlementRate: n("1520"), allocations: [{ ...usdInvoice, amount: n("1000") }] });
    expect(text(preview.rows[0]!.applied)).toBe("0.657895");
  });

  it("finds the one settlement currency", () => {
    expect(settlementCurrency("IQD", ["IQD"])).toBe("IQD");
    expect(settlementCurrency("IQD", ["USD", "IQD"])).toBe("USD");
    expect(settlementCurrency("USD", ["IQD"])).toBe("USD");
    expect(settlementCurrency("USD", ["EUR" as CurrencyCode])).toBeNull();
  });

  it("settles a balance exactly when the rates allow, otherwise just under it", () => {
    const base = { invoiceCurrency: "USD" as const, paymentCurrency: "IQD" as const, settlementRate: n("1520"), digits: 0 };
    expect(text(settlingAmount({ ...base, remaining: n("200") }))).toBe("304000");
    // IQD invoice of 150,000 from USD at 1,520 (2 decimals): 98.68 USD.
    const usd = settlingAmount({ remaining: n("150000"), invoiceCurrency: "IQD", paymentCurrency: "USD", settlementRate: n("1520"), digits: 2 });
    expect(text(usd)).toBe("98.68");
    expect(settlingAmount({ ...base, remaining: 0n })).toBe(0n);
  });
});

describe("supplier returns", () => {
  it("values at lot cost and shows the credit beyond the balance", () => {
    const preview = returnPreview({ lines: [{ quantity: n("2"), lotCostIqd: n(5555.555555555556) }], invoiceRate: n("1"), supplierBalance: n("200000") });
    expect(text(preview.totalIqd, 6)).toBe("11111.111111");
    expect(text(preview.balanceAfter, 6)).toBe("188888.888889");
    expect(preview.credit).toBe(0n);
    const usd = returnPreview({ lines: [{ quantity: n("1"), lotCostIqd: n("150000") }], invoiceRate: n("1500"), supplierBalance: n("40") });
    expect(text(usd.totalCurrency)).toBe("100");
    expect(text(usd.credit)).toBe("60");
  });
});

describe("cost corrections", () => {
  it("splits 10 received as 6 in stock, 2 in custody, 2 sold", () => {
    const split = correctionSplit([
      { purchaseItemId: "p", received: n("10"), warehouse: n("6"), custody: n("2"), returned: 0n, unitDifference: n("100") },
    ]);
    expect(text(split.inventoryIqd)).toBe("600");
    expect(text(split.custodyIqd)).toBe("200");
    expect(text(split.cogsIqd)).toBe("200");
    expect(text(split.totalIqd)).toBe("1000");
    expect(split.rows[0]!.inconsistent).toBe(false);
  });

  it("excludes returned units and handles negative corrections", () => {
    const split = correctionSplit([
      { purchaseItemId: "p", received: n("24"), warehouse: n("22"), custody: 0n, returned: n("2"), unitDifference: n("-50") },
    ]);
    expect(text(split.rows[0]!.sold)).toBe("0");
    expect(text(split.totalIqd)).toBe("-1100");
  });

  it("turns one late landed total into unit differences per line", () => {
    const result = unitDifferences(
      [
        { value: n("120000"), quantity: n("24") },
        { value: n("60000"), quantity: n("6") },
      ],
      n("3000"),
      "quantity",
    );
    expect(result.shares.map((share) => text(share))).toEqual(["2400", "600"]);
    expect(result.units.map((unit) => text(unit))).toEqual(["100", "100"]);
  });
});

describe("reports and helpers", () => {
  it("totals aging buckets in IQD", () => {
    const totals = agingTotals([
      { bucket: "current", currency_code: "IQD", remaining: 1000, remaining_iqd: 1000 },
      { bucket: "31_60", currency_code: "USD", remaining: 10, remaining_iqd: 15000 },
      { bucket: "current", currency_code: "IQD", remaining: 500, remaining_iqd: 500 },
    ]);
    expect(text(totals.byBucket.get("current")!)).toBe("1500");
    expect(text(totals.byBucket.get("31_60")!)).toBe("15000");
    expect(text(totals.totalIqd)).toBe("16500");
  });

  it("formats money and links sources", () => {
    expect(moneyText(n("1234567.5"), "IQD", 0)).toBe("1,234,568 IQD");
    expect(moneyText(n("-12.5"), "USD", 2)).toBe("-12.50 USD");
    expect(purchasingSourceHref("purchase_invoice", "i1")).toBe("/purchasing/invoices/i1");
    expect(purchasingSourceHref("supplier_payment", "p1")).toBeNull();
  });

  it("recognises the server's purchasing refusals", () => {
    expect(isSeparationOfDuties(new ApiError(403, "Translated", "SEPARATION_OF_DUTIES_VIOLATION"))).toBe(true);
    expect(isRateOverrideForbidden(new ApiError(403, "Translated", "PURCHASE_RATE_OVERRIDE_REQUIRED"))).toBe(true);
    expect(isMissingRate(new ApiError(422, "Rate missing", "EXCHANGE_RATE_NOT_FOUND"))).toBe(true);
    expect(isMissingRate(new ApiError(422, "Request validation failed", "VALIDATION_FAILED"))).toBe(false);
  });
});
