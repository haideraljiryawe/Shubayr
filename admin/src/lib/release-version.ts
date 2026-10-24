import "server-only";
import type { components } from "@/types/api";
import { API_URL, APP_VERSION } from "./config";

type ReleaseVersion = components["schemas"]["ReleaseVersion"];

/**
 * The running release (VIS-025), from the API's GET /version (contract
 * 17.10.0): the tag the release workflow built the images from. The sign-in
 * page and the sidebar footer both show this one value. Read at most every
 * five minutes; when the API can't be reached in time, the admin image's own
 * build tag (APP_VERSION — the same tag in a release) stands in.
 */
export async function releaseVersion(): Promise<string> {
  try {
    const response = await fetch(`${API_URL}/version`, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(2_000),
    });
    if (response.ok) {
      const { release } = (await response.json()) as Partial<ReleaseVersion>;
      if (typeof release === "string" && release.trim()) return release.trim();
    }
  } catch {
    // Unreachable or slow: fall through to the image's own tag.
  }
  return APP_VERSION;
}
