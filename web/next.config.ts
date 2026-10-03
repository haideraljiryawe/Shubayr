import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import createNextIntlPlugin from "next-intl/plugin";
import { STATIC_SECURITY_HEADERS } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/**
 * NEXT_PUBLIC_* values are baked into the bundle at build time, so a
 * production build without them would ship localhost into the browser.
 * Refuse it instead (docs/deploy/web-and-admin.md lists every variable).
 */
function requireProductionEnv() {
  const missing = ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_SITE_URL"].filter((name) => !process.env[name]?.trim());
  if (missing.length) {
    throw new Error(`A production build needs ${missing.join(" and ")} (see docs/deploy/web-and-admin.md).`);
  }
  for (const name of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_SITE_URL"]) {
    new URL(process.env[name]!); // throws on a malformed value
  }
}

/**
 * The API serves catalog imagery from its own `/media/{id}` route, backed by
 * object storage. In development that is `http://localhost:8000`, which is
 * plain HTTP — so the https-only pattern below is not enough on its own and
 * next/image rejects every seeded image.
 *
 * The host is derived from the same variable the API client reads, so a
 * deployment pointing at another API does not need a second edit here.
 */
function apiImagePattern() {
  const raw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
  try {
    const { protocol, hostname, port } = new URL(raw);
    return [
      {
        protocol: protocol.replace(":", "") as "http" | "https",
        hostname,
        ...(port ? { port } : {}),
      },
    ];
  } catch {
    // A malformed value must not take the whole build down; remote images from
    // that host simply stay blocked until it is fixed.
    return [];
  }
}

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD) requireProductionEnv();

  const nextConfig: NextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    // Never ship browser source maps (the default, pinned here on purpose).
    productionBrowserSourceMaps: false,
    // The Docker image runs the self-contained server (web/Dockerfile).
    ...(process.env.NEXT_OUTPUT === "standalone" ? { output: "standalone" as const } : {}),
    images: {
      remotePatterns: [
        // Fixture photography and any https CDN.
        { protocol: "https", hostname: "**" },
        ...apiImagePattern(),
      ],
      // Next 16 refuses to optimize an image whose host resolves to a private
      // IP, which is the right default against SSRF — and exactly what a local
      // API on localhost:8000 is. Allowed in development only, so a deployed
      // build keeps the protection. IMAGES_ALLOW_LOCAL_IP=true opts a local
      // production run (tests, Lighthouse against localhost) back in.
      dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production" || process.env.IMAGES_ALLOW_LOCAL_IP === "true",
    },
    async headers() {
      // The Content-Security-Policy carries a per-request nonce, so the
      // middleware sets it; everything else is static.
      return [{ source: "/:path*", headers: [...STATIC_SECURITY_HEADERS] }];
    },
  };

  return withNextIntl(nextConfig);
}
