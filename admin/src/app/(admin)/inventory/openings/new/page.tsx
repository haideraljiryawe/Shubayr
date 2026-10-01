import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions, loadWarehouses } from "@/lib/api/inventory-server";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import { OpeningForm } from "./opening-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inventory");
  return { title: t("newDocument.opening") };
}

/** Post opening stock (inventory.manage): new lots, valued, with their journal entry. */
export default async function NewOpeningPage() {
  const t = await getTranslations("inventory");
  const api = await serverApi();
  const [permissions, { locations }] = await Promise.all([loadPermissions(api), loadWarehouses(api)]);
  if (!permissions.includes("inventory.manage")) return <PageError error={new ApiError(403, "inventory.manage required")} />;

  return (
    <>
      <Link href="/inventory/openings" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("documents.opening")}
      </Link>
      <PageHeader title={t("newDocument.opening")} description={t("opening.description")} />
      <OpeningForm
        locations={[...locations.values()].filter((info) => info.active)}
        canSearchSku={permissions.includes("catalog.products")}
      />
    </>
  );
}
