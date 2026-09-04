import type { ReactNode } from "react";

/**
 * Every route lives under `app/[locale]`, which renders <html> with the right
 * `lang`/`dir`. This root layout is a required passthrough.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
