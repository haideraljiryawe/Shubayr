import { describe, expect, it } from "vitest";
import {
  exportParameters,
  formatReportAmount,
  formatReportNumber,
  localizedReportName,
  reportQuery,
  reportView,
} from "@/lib/reports";

describe("report URL parameters", () => {
  it("builds safe period filters, grouping and server pagination", () => {
    expect(reportQuery("sales", {
      from: "2026-10-01",
      to: "2026-10-20",
      group_by: "sku",
      page: "3",
      per_page: "50",
    }, "2026-10-20")).toEqual({
      from: "2026-10-01",
      to: "2026-10-20",
      group_by: "sku",
      page: 3,
      per_page: 50,
    });
  });

  it("rejects unknown filters and applies Baghdad-day defaults", () => {
    expect(reportQuery("inventory-valuation", {
      as_of: "tomorrow",
      slow_days: "99999",
      supplier_id: "not-an-id",
      per_page: "500",
    }, "2026-10-20")).toEqual({
      as_of: "2026-10-20",
      slow_days: 90,
      page: 1,
      per_page: 20,
    });
  });

  it("removes table paging from background export parameters", () => {
    expect(exportParameters("expenses", {
      from: "2026-10-01", to: "2026-10-20", group_by: "category", page: 4, per_page: 20,
    })).toEqual({ from: "2026-10-01", to: "2026-10-20", group_by: "category" });
  });
});

describe("report formatting", () => {
  it("formats exact IQD and decimal quantities without floating-point arithmetic", () => {
    expect(formatReportAmount("1234567", "en")).toBe("1,234,567 IQD");
    expect(formatReportNumber("1234567.2500", "en")).toBe("1,234,567.25");
    expect(formatReportNumber("-0.25", "ar")).toBe("-0.25");
  });

  it("uses the current locale and then the other language as fallback", () => {
    expect(localizedReportName({ name_ar: "هواتف", name_en: "Phones" }, "ar")).toBe("هواتف");
    expect(localizedReportName({ name_ar: "", name_en: "Phones" }, "ar")).toBe("Phones");
  });
});

describe("report response views", () => {
  it("keeps API totals and pagination and makes drill-down rows linkable", () => {
    const view = reportView("expenses", {
      touches_open_period: true,
      totals: { immediate_iqd: "1200", prepaid_amortisation_iqd: "0", corrections_iqd: "0", total_iqd: "1200", document_count: 1 },
      pagination: { page: 2, per_page: 20, total: 21, pages: 2 },
      data: [{
        group_id: "10000000-0000-4000-8000-000000000001",
        name_ar: "إيجار", name_en: "Rent", immediate_iqd: "1200", prepaid_amortisation_iqd: "0", corrections_iqd: "0", total_iqd: "1200", document_count: 1,
        drilldown: { resource: "expenses", group_by: "category", group_id: "10000000-0000-4000-8000-000000000001", from: "2026-10-01", to: "2026-10-20" },
      }],
    }, "en");
    expect(view).toMatchObject({ page: 2, perPage: 20, total: 21, touchesOpenPeriod: true });
    expect(view.rows[0].cells.group).toMatchObject({ value: "Rent", href: "/expenses?category_id=10000000-0000-4000-8000-000000000001" });
    expect(view.totals.find((row) => row.key === "total_iqd")?.value).toBe("1200");
  });
});
