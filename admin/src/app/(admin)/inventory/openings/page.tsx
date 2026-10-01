import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DocumentsListPage } from "@/components/inventory/documents-list-page";
import type { RawSearchParams } from "@/lib/table-params";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("openings") };
}

/** Opening stock documents (inventory.view), paged by the server. */
export default function OpeningsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  return <DocumentsListPage type="opening" searchParams={searchParams} newHref="/inventory/openings/new" />;
}
