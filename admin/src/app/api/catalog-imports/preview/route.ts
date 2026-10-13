import { NextResponse, type NextRequest } from "next/server";
import { crossOriginRejected, forward, isSameOrigin, respond } from "@/lib/session/bff";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return crossOriginRejected();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { status: 422, code: "VALIDATION_ERROR", message: "A multipart form is required", errors: [] },
      { status: 422 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) {
    return NextResponse.json(
      { status: 422, code: "CATALOG_IMPORT_FILE_REQUIRED", message: "A .xlsx file is required", errors: [] },
      { status: 422 },
    );
  }
  const body = new FormData();
  body.append("file", file, file instanceof File && file.name ? file.name : "catalog.xlsx");
  return respond(
    await forward(request, {
      method: "POST",
      path: `/admin/catalog-imports/preview${request.nextUrl.search}`,
      body,
      timeoutMs: 120_000,
    }),
  );
}
