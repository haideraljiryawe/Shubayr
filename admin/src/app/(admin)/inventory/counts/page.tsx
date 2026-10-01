import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocumentsListPage } from "@/components/inventory/documents-list-page";
import type { RawSearchParams } from "@/lib/table-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("counts") };
}

/** Physical count documents (drafts and approved) (inventory.view), paged by the server. */
export default function CountsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <DocumentsListPage type="count" searchParams={searchParams} newHref="/inventory/counts/new" />;
}
