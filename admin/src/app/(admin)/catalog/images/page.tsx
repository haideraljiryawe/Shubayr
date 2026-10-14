import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileSpreadsheet } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { BulkImagesView } from "./view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("catalogImages");
  return { title: t("title") };
}

/** Catalog → Bulk images (catalog.import): a ZIP of pictures named by SKU. */
export default async function BulkImagesPage() {
  const t = await getTranslations("catalogImages");
  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Link href="/catalog/import" className={buttonClasses({ variant: "secondary" })}>
            <FileSpreadsheet className="size-4" aria-hidden />
            {t("importLink")}
          </Link>
        }
      />
      <BulkImagesView />
    </>
  );
}
