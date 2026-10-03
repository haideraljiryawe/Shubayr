/**
 * Liveness for the container healthcheck and the load balancer: the Next.js
 * server is up and answering. It deliberately does not call the API.
 * The admin answers its own error states when the API is down.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
