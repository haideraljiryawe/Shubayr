import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocumentsListPage } from "@/components/inventory/documents-list-page";
import type { RawSearchParams } from "@/lib/table-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("transfers") };
}

/** Stock transfer documents (inventory.view), paged by the server. */
export default function TransfersPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <DocumentsListPage type="transfer" searchParams={searchParams} newHref="/inventory/transfers/new" />;
}
