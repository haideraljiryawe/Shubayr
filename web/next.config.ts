import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Fixture photography and any https CDN.
      { protocol: "https", hostname: "**" },
      ...apiImagePattern(),
    ],
    // Next 16 refuses to optimize an image whose host resolves to a private
    // IP, which is the right default against SSRF — and exactly what a local
    // API on localhost:8000 is. Allowed in development only, so a deployed
    // build keeps the protection.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
  },
};

export default withNextIntl(nextConfig);
