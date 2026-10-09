import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { loadPermissions } from "@/lib/api/inventory-server";
import { load, serverApi } from "@/lib/api/server";
import { storeDay } from "@/lib/finance/dates";
import { UUID } from "@/lib/inventory";
import { TripView } from "./trip-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("trips.detail");
  return { title: t("title") };
}

/**
 * One trip (trips.view): its orders with what happened to each, the fare,
 * the cash expected and received, and every action the user may take — add
 * orders and start (trips.manage); record deliveries, failures, returns and
 * losses (each with its own permission); receive the driver's cash
 * (cash_receipts.receive); close with the settlement shown first
 * (trips.settle).
 */
export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations("trips.detail");
  const api = await serverApi();
  const [trip, permissions] = await Promise.all([load(api.GET("/admin/external-driver-trips/{id}", { params: { path: { id } } })), loadPermissions(api)]);
  if (!trip.ok) {
    if (trip.error.status === 404) notFound();
    return <PageError error={trip.error} />;
  }

  return (
    <>
      <Link href="/deliveries/trips" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-dark hover:underline">
        <ArrowRight className="size-4 ltr:rotate-180" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={<span dir="ltr" data-testid="trip-number">{trip.data.document_number}</span>} description={t("description")} />
      <TripView trip={trip.data} permissions={permissions} today={storeDay()} />
    </>
  );
}
