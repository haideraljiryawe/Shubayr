import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocumentsListPage } from "@/components/inventory/documents-list-page";
import type { RawSearchParams } from "@/lib/table-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("writeDowns") };
}

/** Inventory write-down documents (inventory.view), paged by the server. */
export default function WriteDownsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <DocumentsListPage type="write_down" searchParams={searchParams} newHref="/inventory/write-downs/new" />;
}
