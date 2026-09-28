import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShell } from "@/components/shell/admin-shell";
import { PageError } from "@/components/shell/page-error";
import { ERROR_CODES } from "@/lib/api/errors";
import { load, serverApi } from "@/lib/api/server";

/**
 * Every signed-in screen renders inside this layout.
 *
 * It reads the staff member from GET /me on every full render — never from a
 * cache — so the menu starts from their CURRENT permissions. The shell then
 * keeps them current on client-side navigation (see AdminShell).
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const api = await serverApi();
  const me = await load(api.GET("/me"));

  if (!me.ok) {
    // An app-surface token cannot be used here; start the session over.
    if (me.error.code === ERROR_CODES.surfaceForbidden)
      redirect("/api/auth/expired");
    return (
      <main className="min-h-dvh bg-background p-6">
        <PageError error={me.error} />
      </main>
    );
  }

  return <AdminShell initialUser={me.data}>{children}</AdminShell>;
}
