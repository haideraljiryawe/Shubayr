import { NextResponse, type NextRequest } from "next/server";
import { crossOriginRejected, forward, isSameOrigin, respond } from "@/lib/session/bff";
import { RECEIPT_MAX_BYTES, RECEIPT_TYPES } from "@/lib/expenses";

/**
 * POST /api/expense-receipts — an expense receipt (image or PDF) from the
 * browser to the API's POST /admin/expense-receipts (expenses.create), with
 * the session's bearer token attached here. The JSON proxy cannot carry a
 * file, so uploads have their own handler.
 *
 * Only the one `file` part is passed on. Type and size are checked here too,
 * so a wrong file is answered at once; the API still checks both and stores
 * the receipt privately.
 */
function refused(status: number, code: string, message: string, field?: string) {
  return NextResponse.json({ status, code, message, errors: field ? [{ field, code, message }] : [] }, { status });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return crossOriginRejected();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refused(422, "VALIDATION_ERROR", "A multipart form with a file is required", "file");
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return refused(422, "VALIDATION_ERROR", "A file is required", "file");
  if (file.size > RECEIPT_MAX_BYTES) return refused(413, "PAYLOAD_TOO_LARGE", "Receipt exceeds 8 MiB");
  if (!(RECEIPT_TYPES as readonly string[]).includes(file.type)) {
    return refused(415, "UNSUPPORTED_MEDIA_TYPE", "Receipts must be an image or a PDF");
  }

  const body = new FormData();
  body.append("file", file, file instanceof File && file.name ? file.name : "receipt");
  const result = await forward(request, { method: "POST", path: "/admin/expense-receipts", body, timeoutMs: 60_000 });
  return respond(result);
}
