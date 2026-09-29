import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { listRows, load, serverApi } from "@/lib/api/server";
import {
  clampPage,
  paginate,
  parseTableParams,
  type RawSearchParams,
} from "@/lib/table-params";
import { toWorkPhoneRow } from "@/lib/work-phones";
import { WorkPhonesView } from "./work-phones-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("workPhones") };
}

const SORT_KEYS = ["name", "phone", "role"] as const;

export default async function WorkPhonesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const t = await getTranslations("workPhones");
  const params = parseTableParams(await searchParams, {
    sortKeys: SORT_KEYS,
    defaultSort: "name",
    filterKeys: ["role", "status"],
  });

  const api = await serverApi();
  const phones = await load(api.GET("/admin/work-phones"));
  if (!phones.ok) return <PageError error={phones.error} />;

  // An unparameterized request keeps the legacy array response. Normalize it
  // before applying the existing server-side table logic.
  const needle = params.q.toLocaleLowerCase();
  const digits = params.q.replace(/\D/g, "");
  const rows = listRows(phones.data)
    .map(toWorkPhoneRow)
    .filter(
      (row) =>
        (!params.q ||
          row.name.toLocaleLowerCase().includes(needle) ||
          (digits !== "" && row.phone.replace(/\D/g, "").includes(digits))) &&
        (!params.filters.role || row.role === params.filters.role) &&
        (params.filters.status !== "active" || row.isActive) &&
        (params.filters.status !== "revoked" || !row.isActive),
    )
    .sort((a, b) => {
      const key = params.sort;
      const order = String(a[key]).localeCompare(String(b[key]), "ar");
      return (
        (order || a.id.localeCompare(b.id)) * (params.dir === "desc" ? -1 : 1)
      );
    });
  const page = clampPage(params.page, rows.length, params.perPage);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <WorkPhonesView
        rows={paginate(rows, page, params.perPage)}
        state={{
          page,
          perPage: params.perPage,
          total: rows.length,
          sort: params.sort,
          dir: params.dir,
        }}
      />
    </>
  );
}
