import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2, Circle, CircleAlert } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { load, serverApi } from "@/lib/api/server";
import { ADMIN_MODULES } from "@/lib/config";
import { firstDayComplete, firstDaySteps, type FirstDayStep } from "@/lib/first-day";
import { locationIndex } from "@/lib/inventory";
import { parseModules } from "@/lib/modules";
import { visibleNav } from "@/lib/nav";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("dashboard") };
}

type Api = Awaited<ReturnType<typeof serverApi>>;

/**
 * The dashboard: the owner's first-day checklist until the catalog is
 * stocked, then the sections the staff member's permissions open, within the
 * modules this installation enables (ADMIN_MODULES).
 */
export default async function DashboardPage() {
  const t = await getTranslations("dashboard");
  const tNav = await getTranslations("nav");
  const api = await serverApi();
  const me = await load(api.GET("/me"));
  const user = me.ok ? me.data : null;
  const modules = parseModules(ADMIN_MODULES);
  const permissions = user?.permissions ?? [];
  const sections = visibleNav(permissions, undefined, modules).filter((item) => item.key !== "dashboard");
  const steps = firstDaySteps({ permissions, modules, ...(await firstDayFacts(api, permissions)) });

  return (
    <div data-testid="dashboard">
      <PageHeader
        title={t("welcome", { name: user?.name || user?.username || "" })}
        description={t("body")}
      />
      {steps.length && !firstDayComplete(steps) ? <FirstDay steps={steps} /> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((item) => (
          <Link key={item.key} href={item.href} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <p className="font-bold text-primary-dark">{tNav(item.key)}</p>
              <p className="mt-1 text-sm text-text-muted">
                {t(`section.${item.key}`)}
              </p>
            </Card>
          </Link>
        ))}
      </div>
      {sections.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted" data-testid="no-sections">
          {t("noSections")}
        </p>
      ) : null}
    </div>
  );
}

/** What the checklist needs, each fact null when the person may not read it. */
async function firstDayFacts(api: Api, permissions: readonly string[]) {
  const has = (key: string) => permissions.includes(key);
  const [tree, brands, products, openings, warehouses, suppliers, parties] = await Promise.all([
    has("catalog.categories") ? load(api.GET("/admin/categories")) : null,
    has("catalog.brands") ? load(api.GET("/admin/brands", { params: { query: { per_page: 1 } } })) : null,
    has("catalog.products") ? load(api.GET("/admin/products", { params: { query: { per_page: 1 } } })) : null,
    has("inventory.view") ? load(api.GET("/admin/inventory/openings", { params: { query: { per_page: 1 } } })) : null,
    has("inventory.view") ? load(api.GET("/admin/inventory/warehouses")) : null,
    has("suppliers.view") ? load(api.GET("/admin/suppliers", { params: { query: { per_page: 1 } } })) : null,
    has("drivers.manage") ? load(api.GET("/admin/delivery-parties", { params: { query: { per_page: 1, active: true } } })) : null,
  ]);
  return {
    subcategoryCount: tree?.ok
      ? tree.data.reduce((sum, department) => sum + (department.children?.length ?? 0), 0)
      : null,
    brandCount: brands?.ok ? brands.data.total : null,
    productCount: products?.ok ? products.data.total : null,
    openingCount: openings?.ok ? openings.data.total : null,
    sellableLocations: warehouses?.ok
      ? [...locationIndex(warehouses.data).values()].filter((info) => info.active && info.sellable).length
      : null,
    supplierCount: suppliers?.ok ? suppliers.data.total : null,
    partyCount: parties?.ok ? (parties.data.total ?? 0) : null,
  };
}

async function FirstDay({ steps }: { steps: FirstDayStep[] }) {
  const t = await getTranslations("dashboard.firstDay");
  const done = steps.filter((step) => step.done).length;
  return (
    <Card className="mb-6 flex flex-col gap-4 border-primary/40" data-testid="first-day">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <p className="text-sm text-text-muted">{t("body")}</p>
        </div>
        <Badge tone="info">{t("progress", { done, total: steps.length })}</Badge>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={step.key} data-testid={`first-day-${step.key}`} data-done={step.done}>
            <Link
              href={step.href}
              className="flex items-start gap-3 rounded-md border border-border px-4 py-3 transition-colors hover:bg-card"
            >
              {step.done ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-dark" aria-hidden />
              ) : step.blockedBy ? (
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning-dark" aria-hidden />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-text-muted" aria-hidden />
              )}
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">
                  {t("stepNumber", { number: index + 1 })} {t(`steps.${step.key}.title`)}
                  {step.optional ? <span className="ms-2 text-xs font-normal text-text-muted">{t("optional")}</span> : null}
                  {step.done ? <span className="sr-only"> — {t("done")}</span> : null}
                </span>
                <span className="text-sm text-text-muted">
                  {step.blockedBy ? t("needsLocation") : t(`steps.${step.key}.body`)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
