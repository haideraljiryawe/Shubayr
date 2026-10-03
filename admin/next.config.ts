import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** The repository root: the admin imports web/src/app/tokens.css from there. */
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Never ship browser source maps (the default, pinned here on purpose).
  productionBrowserSourceMaps: false,
  // The Docker image runs the self-contained server (admin/Dockerfile).
  ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  async headers() {
    // The Content-Security-Policy carries a per-request nonce, so the proxy
    // sets it on pages; everything else is static and goes on every response
    // (an admin must never be framed, indexed or leak its URLs).
    return [{ source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] }];
  },
};

export default withNextIntl(nextConfig);
