import { NextResponse, type NextRequest } from "next/server";
import { forward, respond } from "@/lib/session/bff";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * An import's validation report (every row and issue, as CSV), downloaded as
 * a file with a readable name. The API's CSV already starts with a UTF-8
 * byte-order mark (API 16.1), so Excel shows Arabic text correctly; it is
 * passed through unchanged.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ status: 404, code: "NOT_FOUND", message: "Not found", errors: [] }, { status: 404 });
  }
  const result = await forward(request, {
    method: "GET",
    path: `/admin/catalog-imports/${id}/error-report`,
    responseType: "arrayBuffer",
    timeoutMs: 60_000,
  });
  const response = respond(result);
  if (result.status === 200) {
    response.headers.set("Content-Disposition", `attachment; filename="shubayr-import-${id.slice(0, 8)}-report.csv"`);
  }
  return response;
}
