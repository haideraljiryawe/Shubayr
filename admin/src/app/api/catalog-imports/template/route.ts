import { type NextRequest } from "next/server";
import { forward, respond } from "@/lib/session/bff";

export async function GET(request: NextRequest) {
  const result = await forward(request, {
    method: "GET",
    path: "/admin/catalog-imports/template",
    responseType: "arrayBuffer",
    timeoutMs: 60_000,
  });
  const response = respond(result);
  response.headers.set(
    "Content-Disposition",
    'attachment; filename="shubayr-catalog-import.xlsx"',
  );
  return response;
}
