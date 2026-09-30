import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import {
  PRESET_FILTER_KEYS,
  PRESET_SORT_KEYS,
  asPage,
  lastPage,
  presetListQuery,
} from "@/lib/list-queries";
import { presetKeys } from "@/lib/permissions";
import { parseTableParams, type RawSearchParams } from "@/lib/table-params";
import { PresetTable, type PresetRow } from "./preset-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("presets") };
}

export default async function PresetsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const t = await getTranslations("presets");
  const params = parseTableParams(await searchParams, {
    sortKeys: PRESET_SORT_KEYS,
    defaultSort: "name",
    filterKeys: PRESET_FILTER_KEYS,
  });

  // Search, filter, sort and paging all run on the API (contract 6.2+).
  const api = await serverApi();
  let presets = await load(api.GET("/admin/presets", { params: { query: presetListQuery(params) } }));
  if (!presets.ok) return <PageError error={presets.error} />;
  let page = asPage(presets.data, params.perPage);
  if (page.rows.length === 0 && page.total > 0 && params.page > 1) {
    const last = lastPage(page.total, params.perPage);
    presets = await load(
      api.GET("/admin/presets", { params: { query: presetListQuery({ ...params, page: last }) } }),
    );
    if (!presets.ok) return <PageError error={presets.error} />;
    page = asPage(presets.data, params.perPage);
  }
  const rows: PresetRow[] = page.rows.map((preset) => ({
    id: preset.id,
    name: preset.name,
    description: preset.description ?? null,
    isSystem: preset.is_system,
    permissions: presetKeys(preset).length,
  }));

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Link
            href="/presets/new"
            className={buttonClasses()}
            data-testid="preset-new"
          >
            <Plus className="size-4" aria-hidden />
            {t("new")}
          </Link>
        }
      />
      <PresetTable
        rows={rows}
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
