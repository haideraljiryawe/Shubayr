import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import {
  WORK_PHONE_FILTER_KEYS,
  WORK_PHONE_SORT_KEYS,
  asPage,
  lastPage,
  workPhoneListQuery,
} from "@/lib/list-queries";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { toWorkPhoneRow } from "@/lib/work-phones";
import { WorkPhonesView } from "./work-phones-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("workPhones") };
}

export default async function WorkPhonesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const t = await getTranslations("workPhones");
  const params = parseTableParams(await searchParams, {
    sortKeys: WORK_PHONE_SORT_KEYS,
    defaultSort: "name",
    filterKeys: WORK_PHONE_FILTER_KEYS,
  });

  // Search, filters, sort and paging all run on the API (contract 6.2+).
  const api = await serverApi();
  let phones = await load(api.GET("/admin/work-phones", { params: { query: workPhoneListQuery(params) } }));
  if (!phones.ok) return <PageError error={phones.error} />;
  let page = asPage(phones.data, params.perPage);
  if (page.rows.length === 0 && page.total > 0 && params.page > 1) {
    const last = lastPage(page.total, params.perPage);
    phones = await load(
      api.GET("/admin/work-phones", { params: { query: workPhoneListQuery({ ...params, page: last }) } }),
    );
    if (!phones.ok) return <PageError error={phones.error} />;
    page = asPage(phones.data, params.perPage);
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <WorkPhonesView
        rows={page.rows.map(toWorkPhoneRow)}
        state={{
          page: page.page,
          perPage: params.perPage,
          total: page.total,
          sort: params.sort,
          dir: params.dir,
        }}
      />
    </>
  );
}
