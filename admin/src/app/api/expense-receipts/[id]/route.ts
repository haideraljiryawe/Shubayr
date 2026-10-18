import { NextResponse, type NextRequest } from "next/server";
import { forward, respond } from "@/lib/session/bff";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/expense-receipts/{id} — a private expense receipt (expenses.read),
 * streamed from the API's GET /admin/expense-receipts/{id} with the session's
 * token. It is shown in the page (an image or a PDF opened inline), or, with
 * ?download=1, saved as a file. The bytes never come from a public URL.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ status: 404, code: "NOT_FOUND", message: "Not found", errors: [] }, { status: 404 });
  }
  const result = await forward(request, {
    method: "GET",
    path: `/admin/expense-receipts/${id}`,
    responseType: "arrayBuffer",
    timeoutMs: 60_000,
  });
  const response = respond(result);
  if (result.status === 200) {
    const pdf = (result.contentType ?? "").includes("pdf");
    const name = `receipt-${id.slice(0, 8)}${pdf ? ".pdf" : ""}`;
    const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    response.headers.set("Content-Disposition", `${disposition}; filename="${name}"`);
    // A private document: never kept by a shared cache.
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}
