import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { loadPartyChoice } from "@/lib/api/parties-server";
import { loadBackdatingWindow, loadCashAccounts } from "@/lib/api/purchasing-server";
import { ApiError } from "@/lib/api/errors";
import { serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import type { RawSearchParams } from "@/lib/table-params";
import { TripForm } from "./trip-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("trips.create");
  return { title: t("title") };
}

/** A new trip for an external driver, with its one fare (trips.manage). */
export default async function NewTripPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const t = await getTranslations("trips.create");
  const raw = await searchParams;
  const api = await serverApi();
  const permissions = await loadPermissions(api);
  if (!permissions.includes("trips.manage")) return <PageError error={new ApiError(403, "trips.manage required")} />;
  const [driver, cashAccounts, windowDays] = await Promise.all([
    loadPartyChoice(api, typeof raw.driver_party_id === "string" ? raw.driver_party_id : undefined),
    loadCashAccounts(api),
    loadBackdatingWindow(api),
  ]);

  return (
    <>
      <Link href="/deliveries/trips" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("description")} />
      <TripForm
        driver={driver}
        cashAccounts={(cashAccounts ?? []).filter((account) => account.currency_code === "IQD" && account.is_active)}
        canBackdate={permissions.includes("backdate.approve")}
        today={storeDay()}
        windowDays={windowDays}
      />
    </>
  );
}
