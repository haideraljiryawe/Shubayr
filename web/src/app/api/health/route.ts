/**
 * Liveness for the container healthcheck and the load balancer: the Next.js
 * server is up and answering. It deliberately does not call the API — a
 * store whose API is down still serves its pages and their error states.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
