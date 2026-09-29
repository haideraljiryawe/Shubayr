import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { listRows, load, serverApi } from "@/lib/api/server";
import {
  STAFF_FILTER_KEYS,
  STAFF_SORT_KEYS,
  queryStaff,
} from "@/lib/staff-query";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { StaffTable } from "./staff-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("staff") };
}

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const t = await getTranslations("staff");
  const params = parseTableParams(await searchParams, {
    sortKeys: STAFF_SORT_KEYS,
    defaultSort: "name",
    filterKeys: STAFF_FILTER_KEYS,
  });

  const api = await serverApi();
  const staff = await load(api.GET("/admin/staff"));
  if (!staff.ok) return <PageError error={staff.error} />;
  // The preset filter needs roles.manage; without it the filter is simply
  // not offered — the list itself only needs users.manage.
  const presets = await load(api.GET("/admin/presets"));

  const page = queryStaff(listRows(staff.data), params);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Link
            href="/staff/new"
            className={buttonClasses()}
            data-testid="staff-new"
          >
            <Plus className="size-4" aria-hidden />
            {t("new")}
          </Link>
        }
      />
      <StaffTable
        rows={page.rows}
        state={{
          page: page.page,
          perPage: params.perPage,
          total: page.total,
          sort: params.sort,
          dir: params.dir,
        }}
        presets={
          presets.ok
            ? listRows(presets.data).map(({ id, name }) => ({ id, name }))
            : null
        }
      />
    </>
  );
}
