import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Images } from "lucide-react";
import { PageError } from "@/components/shell/page-error";
import { buttonClasses, PageHeader } from "@/components/ui";
import { load, serverApi } from "@/lib/api/server";
import type { CatalogImport } from "@/lib/catalog-import";
import { ImportHelp } from "./import-help";
import { ImportHistory } from "./import-history";
import { CatalogImportView } from "./view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalogImport");
  return { title: t("title") };
}

// The history is a summary (no preview rows since API 16), so a page can be longer.
const HISTORY_PER_PAGE = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Catalog → Import (catalog.import): template, upload and preview, commit,
 * result, and the import history. `?id=` reopens one import (a background
 * check in progress, a preview to apply, or a finished result).
 */
export default async function CatalogImportPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; page?: string }>;
}) {
  const t = await getTranslations("catalogImport");
  const query = await searchParams;
  const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
  const id = query.id && UUID.test(query.id) ? query.id : null;
  const api = await serverApi();
  const [history, me, opened] = await Promise.all([
    load(api.GET("/admin/catalog-imports", { params: { query: { page, per_page: HISTORY_PER_PAGE } } })),
    load(api.GET("/me")),
    id ? load(api.GET("/admin/catalog-imports/{id}", { params: { path: { id } } })) : Promise.resolve(null),
  ]);
  if (!history.ok) return <PageError error={history.error} />;
  if (opened && !opened.ok) return <PageError error={opened.error} />;
  const permissions = me.ok ? (me.data.permissions ?? []) : [];
  const initial: CatalogImport | null = opened?.ok ? opened.data : null;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Link href="/catalog/images" className={buttonClasses({ variant: "secondary" })}>
            <Images className="size-4" aria-hidden />
            {t("imagesLink")}
          </Link>
        }
      />
      <div className="flex flex-col gap-6">
        <CatalogImportView
          initial={initial}
          canPostStock={permissions.includes("inventory.manage") && permissions.includes("cost.view")}
        />
        <ImportHelp />
        <ImportHistory
          rows={history.data.data}
          page={history.data.page}
          total={history.data.total}
          perPage={HISTORY_PER_PAGE}
          openedId={initial?.id ?? null}
          meId={me.ok ? me.data.id : null}
        />
      </div>
    </>
  );
}
