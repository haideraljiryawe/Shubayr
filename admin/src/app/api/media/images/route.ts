import { NextResponse, type NextRequest } from "next/server";
import { crossOriginRejected, forward, isSameOrigin, respond } from "@/lib/session/bff";
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from "@/lib/product-images";

/**
 * POST /api/media/images — a catalog picture from the browser to the API's
 * POST /media/images (catalog.products), with the session's bearer token
 * attached here. The JSON proxy cannot carry a file, and the media route
 * lives outside /admin, so it has this one handler of its own.
 *
 * Only the one `file` part is passed on. Type and size are checked here too,
 * so a wrong file is answered at once instead of after an 8 MiB upload to
 * the API; the API still checks both.
 */
function refused(status: number, code: string, message: string, field?: string) {
  return NextResponse.json(
    { status, code, message, errors: field ? [{ field, code, message }] : [] },
    { status },
  );
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
  if (!(file instanceof Blob) || file.size === 0) {
    return refused(422, "VALIDATION_ERROR", "A file is required", "file");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return refused(413, "PAYLOAD_TOO_LARGE", "Image exceeds 8 MiB");
  }
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return refused(415, "UNSUPPORTED_MEDIA_TYPE", "Unsupported image MIME type");
  }

  const body = new FormData();
  body.append("file", file, file instanceof File && file.name ? file.name : "image");
  const result = await forward(request, {
    method: "POST",
    path: "/media/images",
    body,
    timeoutMs: 60_000,
  });
  return respond(result);
}
