import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadDocumentPage, loadPermissions } from "@/lib/api/inventory-server";
import { serverApi } from "@/lib/api/server";
import { lastPage } from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import type { DocumentType, InventoryDocument } from "@/lib/inventory";
import { DocumentsTable } from "./documents-table";

/** The permission that creates each document type (x-permission on its POST). */
export const CREATE_PERMISSION: Record<DocumentType, string> = {
  opening: "inventory.manage",
  transfer: "inventory.transfer",
  count: "inventory.count",
  write_down: "inventory.write_down",
};

/**
 * A list page for one inventory document type (inventory.view), paged by the
 * server, with a "new" action for whoever holds that type's permission.
 */
export async function DocumentsListPage({
  type,
  searchParams,
  newHref,
}: {
  type: DocumentType;
  searchParams: Promise<RawSearchParams>;
  newHref: string;
}) {
  const t = await getTranslations("inventory");
  const params = parseTableParams(await searchParams, { sortKeys: ["created_at"], defaultSort: "created_at", defaultDir: "desc" });
  const api = await serverApi();
  const [documents, permissions] = await Promise.all([
    loadDocumentPage(api, type, { page: params.page, per_page: params.perPage }),
    loadPermissions(api),
  ]);
  let result = documents;
  if (result.ok && result.data.data.length === 0 && result.data.total > 0 && params.page > 1) {
    result = await loadDocumentPage(api, type, { page: lastPage(result.data.total, params.perPage), per_page: params.perPage });
  }
  if (!result.ok) return <PageError error={result.error} />;

  return (
    <>
      <PageHeader
        title={t(`documents.${type}`)}
        description={t(`documentsDescription.${type}`)}
        actions={
          permissions.includes(CREATE_PERMISSION[type]) ? (
            <Link href={newHref} className={buttonClasses()} data-testid="document-new">
              <Plus className="size-4" aria-hidden />
              {t(`newDocument.${type}`)}
            </Link>
          ) : null
        }
      />
      <DocumentsTable
        type={type}
        rows={result.data.data as InventoryDocument[]}
        state={{ page: result.data.page, perPage: result.data.per_page, total: result.data.total, sort: "created_at", dir: "desc" }}
        canViewLedger={permissions.includes("ledger.view")}
      />
    </>
  );
}
