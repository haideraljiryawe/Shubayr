import { NextResponse, type NextRequest } from "next/server";
import { forward, respond } from "@/lib/session/bff";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

/**
 * An import's validation report (every row and issue, as CSV), downloaded as
 * a file. The API sends UTF-8 without a byte-order mark, which Excel reads
 * as the wrong code page; the mark is added so Arabic text opens readable.
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
  if (result.status !== 200) return respond(result);
  const bytes = new Uint8Array(result.body);
  const marked = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const body = marked ? bytes : new Uint8Array([...BOM, ...bytes]);
  const response = respond({ ...result, body: body.buffer as ArrayBuffer });
  response.headers.set("Content-Type", "text/csv; charset=utf-8");
  response.headers.set("Content-Disposition", `attachment; filename="shubayr-import-${id.slice(0, 8)}-report.csv"`);
  return response;
}
