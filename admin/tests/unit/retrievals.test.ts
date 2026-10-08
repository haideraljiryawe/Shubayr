import { describe, expect, it } from "vitest";
import { retrievalListQuery } from "@/lib/retrievals";

describe("retrievalListQuery", () => {
  const party = "11111111-1111-4111-8111-111111111111";
  const order = "22222222-2222-4222-8222-222222222222";

  it("passes valid filters through as API parameters", () => {
    expect(retrievalListQuery({ party_id: party, order_id: order, status: "open", from: "2026-10-01", to: "2026-10-03" }, 2, 20)).toEqual({
      page: 2,
      per_page: 20,
      party_id: party,
      order_id: order,
      status: "open",
      from: "2026-10-01",
      to: "2026-10-03",
    });
  });

  it("drops what the API would refuse: bad ids, unknown status, malformed or inverted dates", () => {
    expect(retrievalListQuery({ party_id: "x", order_id: "1", status: "lost", from: "01/10/2026" }, 1, 20)).toEqual({ page: 1, per_page: 20 });
    expect(retrievalListQuery({ from: "2026-10-05", to: "2026-10-01" }, 1, 20)).toEqual({ page: 1, per_page: 20 });
    expect(retrievalListQuery({ to: "2026-10-01" }, 1, 20)).toEqual({ page: 1, per_page: 20, to: "2026-10-01" });
  });
});
