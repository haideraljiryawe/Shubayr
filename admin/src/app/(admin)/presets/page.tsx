import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { buttonClasses, PageHeader } from "@/components/ui";
import { PageError } from "@/components/shell/page-error";
import { load, serverApi } from "@/lib/api/server";
import { presetKeys } from "@/lib/permissions";
import {
  clampPage,
  paginate,
  parseTableParams,
  type RawSearchParams,
} from "@/lib/table-params";
import { PresetTable, type PresetRow } from "./preset-table";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("presets") };
}

const SORT_KEYS = ["name", "permissions"] as const;

export default async function PresetsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const t = await getTranslations("presets");
  const params = parseTableParams(await searchParams, {
    sortKeys: SORT_KEYS,
    defaultSort: "name",
    filterKeys: ["kind"],
  });

  const api = await serverApi();
  const presets = await load(api.GET("/admin/presets"));
  if (!presets.ok) return <PageError error={presets.error} />;

  // Like the staff list, GET /admin/presets has no query parameters, so the
  // search, filter, sort and page are applied here on the server.
  const needle = params.q.toLocaleLowerCase();
  const rows: PresetRow[] = presets.data
    .map((preset) => ({
      id: preset.id,
      name: preset.name,
      description: preset.description ?? null,
      isSystem: preset.is_system,
      permissions: presetKeys(preset).length,
    }))
    .filter(
      (row) =>
        (!needle ||
          row.name.toLocaleLowerCase().includes(needle) ||
          (row.description ?? "").toLocaleLowerCase().includes(needle)) &&
        (params.filters.kind !== "system" || row.isSystem) &&
        (params.filters.kind !== "custom" || !row.isSystem),
    )
    .sort((a, b) => {
      const order =
        params.sort === "permissions"
          ? a.permissions - b.permissions
          : a.name.localeCompare(b.name);
      return (
        (order || a.id.localeCompare(b.id)) * (params.dir === "desc" ? -1 : 1)
      );
    });
  const page = clampPage(params.page, rows.length, params.perPage);

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
