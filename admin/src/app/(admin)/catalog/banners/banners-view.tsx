"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, Eye, EyeOff, Pencil, Plus, Repeat, ShieldAlert, Star, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { browserApi, unwrap } from "@/lib/api/client";
import { describeError } from "@/lib/api/errors";
import {
  BANNER_STATUSES,
  DEFAULTS_SHOWN,
  baghdadText,
  bannerName,
  defaultsInFeedOrder,
  displayTitle,
  duplicateBody,
  filterBanners,
  nextSortOrder,
  removalBlocked,
  reorderIds,
  scheduleModeOf,
  targetName,
  type Banner,
  type BannerPatch,
  type BannerStatus,
} from "@/lib/banners";
import type { CategoryOption } from "@/components/catalog/banner-target-picker";
import { BannerFormDialog } from "./banner-form";
import { DefaultSwapDialog } from "./default-swap-dialog";
import { STATUS_TONE } from "./status";

type Dialog =
  | { kind: "new" }
  | { kind: "edit"; banner: Banner }
  | { kind: "delete"; banner: Banner }
  | { kind: "swap"; banner: Banner }
  | null;

/**
 * The home banners in the order the store shows them. Each row has its
 * picture, name, place, schedule (Asia/Baghdad), click action (with a warning
 * when its product or category is no longer visible), default flag and the
 * API's effective status; edit, switch on/off, move up/down (one atomic
 * reorder call), duplicate (as a disabled copy) and delete — the last behind
 * its own confirmation, distinct from switching off.
 */
export function BannersView({ banners, categories }: { banners: Banner[]; categories: CategoryOption[] }) {
  const t = useTranslations("banners");
  const tErrors = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [filter, setFilter] = useState<BannerStatus | "">("");
  const [busy, setBusy] = useState<string | null>(null);
  const shown = filterBanners(banners, filter);
  const feedDefaults = defaultsInFeedOrder(banners);
  const defaultCount = banners.filter((banner) => banner.is_default).length;

  async function act(key: string, work: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await work();
      toast(done);
      router.refresh();
    } catch (cause) {
      toast(`${describeError(tErrors, cause)} ${t("actionFailed")}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const patch = (id: string, body: BannerPatch) =>
    unwrap(browserApi.PATCH("/admin/banners/{id}", { params: { path: { id } }, body }));

  function move(banner: Banner, delta: -1 | 1) {
    const index = banners.findIndex((item) => item.id === banner.id);
    const ids = reorderIds(banners, index, delta);
    if (!ids) return;
    // The complete order in one atomic call: it all applies or none of it.
    void act(`move-${banner.id}`, () => unwrap(browserApi.PUT("/admin/banners/order", { body: { ids } })), t("moved", { title: bannerName(banner) }));
  }

  // Raw stored text (17.9.0): this language, else the other, as customers see it.
  const pick = (ar: string | null, en: string | null) => ((locale === "ar" ? ar || en : en || ar) ?? "").trim();
  const subtitleOf = (banner: Banner) => pick(banner.subtitle_ar, banner.subtitle_en) || (banner.subtitle ?? "");
  const ctaOf = (banner: Banner) => pick(banner.cta_label_ar, banner.cta_label_en) || (banner.cta_text ?? "");

  const actionText = (banner: Banner) => {
    const target = banner.action.target;
    switch (banner.action_type) {
      case "url":
        return (
          <>
            {t("linkTo")}{" "}
            <span dir="ltr" className="break-all">
              {banner.action.url ?? banner.link_url}
            </span>
          </>
        );
      case "product":
      case "category":
        return t(`opens.${banner.action_type}`, { name: target ? targetName(target, locale) : t("target.missing") });
      case "offers":
        return t("opens.offers");
      default:
        return t("noAction");
    }
  };

  const scheduleText = (banner: Banner) => {
    const mode = scheduleModeOf(banner);
    if (mode === "permanent") return t("schedule.permanent");
    const from = banner.starts_at ? baghdadText(banner.starts_at, locale) : "";
    const to = banner.ends_at ? baghdadText(banner.ends_at, locale) : "";
    return t(`schedule.${mode}`, { from, to });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t("filter.label")}
          <Select value={filter} onValueChange={(value) => setFilter(value as BannerStatus | "")} data-testid="banner-filter">
            <option value="">{t("filter.all", { count: banners.length })}</option>
            {BANNER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`statuses.${status}`)} ({filterBanners(banners, status).length})
              </option>
            ))}
          </Select>
        </label>
        <Button onClick={() => setDialog({ kind: "new" })} data-testid="banner-new">
          <Plus className="size-4" aria-hidden />
          {t("new")}
        </Button>
      </div>
      <p className="text-xs text-text-muted">{t("timeZoneNote")}</p>
      <Card className="flex flex-col gap-1 p-3 text-sm" data-testid="banner-defaults-summary" data-usable={feedDefaults.length}>
        <span className="flex items-center gap-2 font-semibold">
          <Star className="size-4" aria-hidden />
          {t("defaults.summary", { usable: feedDefaults.length, total: defaultCount })}
        </span>
        <span className="text-xs text-text-muted">{t("defaults.rule", { count: DEFAULTS_SHOWN })}</span>
        {feedDefaults.length > 0 ? (
          <span className="text-xs text-text-muted" data-testid="banner-defaults-feed">
            {t("defaults.feed", { names: feedDefaults.slice(0, DEFAULTS_SHOWN).map(bannerName).join(" · ") })}
          </span>
        ) : null}
        {feedDefaults.length < DEFAULTS_SHOWN ? (
          <Alert tone="info" data-testid="banner-defaults-short">
            {t("defaults.short", { count: DEFAULTS_SHOWN })}
          </Alert>
        ) : null}
      </Card>

      {shown.length === 0 ? (
        <Card className="text-sm text-text-muted" data-testid="banners-empty">
          {banners.length === 0 ? t("empty") : t("emptyFilter")}
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="banner-list">
          {shown.map((banner) => {
            const index = banners.findIndex((item) => item.id === banner.id);
            const status = banner.effective_status;
            const target = banner.action.target;
            const blocked = removalBlocked(banner);
            const targetGone = (banner.action_type === "product" || banner.action_type === "category") && (!target || !target.available);
            const pending = busy !== null;
            return (
              <li key={banner.id}>
                <Card className="flex flex-wrap items-center gap-4 p-3" data-testid="banner-row" data-banner-id={banner.id} data-status={status}>
                  <span className="relative aspect-[2/1] w-32 shrink-0 overflow-hidden rounded-md border border-border bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element -- API media URL */}
                    <img src={banner.image_url} alt="" className="absolute inset-0 size-full object-cover" data-testid="banner-thumb" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold" dir="auto" data-testid="banner-row-title">
                        {bannerName(banner)}
                      </span>
                      <Badge tone={STATUS_TONE[status]} data-testid="banner-status">
                        {t(`statuses.${status}`)}
                      </Badge>
                      {banner.is_default ? (
                        <Badge tone="info" data-testid="banner-default-badge">
                          {t("defaults.badge", { priority: banner.default_priority })}
                        </Badge>
                      ) : null}
                      {banner.show_text ? null : <Badge data-testid="banner-image-only-badge">{t("imageOnly")}</Badge>}
                    </span>
                    {banner.show_text ? (
                      <span className="line-clamp-1 text-sm text-text-muted" dir="auto">
                        {displayTitle(banner, locale)}
                        {subtitleOf(banner) ? ` — ${subtitleOf(banner)}` : ""}
                      </span>
                    ) : null}
                    <span className="text-xs text-text-muted" data-testid="banner-position">
                      {t("position", { number: index + 1, total: banners.length, order: banner.sort_order })}
                    </span>
                    <span className="text-xs text-text-muted" data-testid="banner-schedule-text">
                      {scheduleText(banner)}
                    </span>
                    <span className="text-xs text-text-muted" data-testid="banner-link-text" data-action={banner.action_type}>
                      {actionText(banner)}
                      {banner.show_text && banner.action_type !== "none" && ctaOf(banner) ? ` · ${t("buttonLabel", { label: ctaOf(banner) })}` : ""}
                    </span>
                    {targetGone ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-warning-dark" data-testid="banner-target-unavailable">
                        <AlertTriangle className="size-3.5" aria-hidden />
                        {t(`target.unavailableHint.${banner.action_type as "product" | "category"}`)}
                      </span>
                    ) : null}
                    {blocked ? (
                      <span className="flex items-center gap-1 text-xs font-semibold text-warning-dark" data-testid="banner-removal-blocked">
                        <ShieldAlert className="size-3.5" aria-hidden />
                        {t("defaults.lastTwo")}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="ghost" aria-label={t("moveUp")} title={t("moveUp")} disabled={pending || index === 0} onClick={() => move(banner, -1)} data-testid="banner-up">
                      <ArrowUp className="size-4" aria-hidden />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t("moveDown")}
                      title={t("moveDown")}
                      disabled={pending || index === banners.length - 1}
                      onClick={() => move(banner, 1)}
                      data-testid="banner-down"
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDialog({ kind: "edit", banner })} data-testid="banner-edit">
                      <Pencil className="size-4" aria-hidden />
                      {t("edit")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending || (banner.is_active && blocked)}
                      pending={busy === `toggle-${banner.id}`}
                      onClick={() =>
                        void act(
                          `toggle-${banner.id}`,
                          () => patch(banner.id, { is_active: !banner.is_active }),
                          banner.is_active ? t("disabled", { title: bannerName(banner) }) : t("enabled", { title: bannerName(banner) }),
                        )
                      }
                      data-testid="banner-toggle"
                    >
                      {banner.is_active ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                      {banner.is_active ? t("disable") : t("enable")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      pending={busy === `copy-${banner.id}`}
                      onClick={() =>
                        void act(
                          `copy-${banner.id}`,
                          () => unwrap(browserApi.POST("/admin/banners", { body: duplicateBody(banner, nextSortOrder(banners)) })),
                          t("duplicated", { title: bannerName(banner) }),
                        )
                      }
                      data-testid="banner-duplicate"
                    >
                      <Copy className="size-4" aria-hidden />
                      {t("duplicate")}
                    </Button>
                    {banner.is_default ? (
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDialog({ kind: "swap", banner })} data-testid="banner-swap-open">
                        <Repeat className="size-4" aria-hidden />
                        {t("swap.open")}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-error-dark"
                      disabled={pending || blocked}
                      onClick={() => setDialog({ kind: "delete", banner })}
                      data-testid="banner-delete"
                    >
                      <Trash2 className="size-4" aria-hidden />
                      {t("delete")}
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {dialog?.kind === "new" || dialog?.kind === "edit" ? (
        <BannerFormDialog
          key={dialog.kind === "edit" ? dialog.banner.id : "new"}
          original={dialog.kind === "edit" ? dialog.banner : null}
          nextSortOrder={nextSortOrder(banners)}
          categories={categories}
          onClose={() => setDialog(null)}
          onSaved={(saved, created) => {
            toast(created ? t("created", { title: bannerName(saved) }) : t("saved", { title: bannerName(saved) }));
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}

      {dialog?.kind === "swap" ? (
        <DefaultSwapDialog
          outgoing={dialog.banner}
          banners={banners}
          onClose={() => setDialog(null)}
          onSwapped={(incoming) => {
            toast(t("swap.done", { outgoing: bannerName(dialog.banner), incoming: bannerName(incoming) }));
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("deleteTitle", { title: dialog?.kind === "delete" ? bannerName(dialog.banner) : "" })}
        body={dialog?.kind === "delete" && dialog.banner.is_default ? `${t("deleteBody")} ${t("defaults.deleteNote")}` : t("deleteBody")}
        confirmLabel={t("deleteConfirm")}
        requireReason={false}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await unwrap(browserApi.DELETE("/admin/banners/{id}", { params: { path: { id: dialog.banner.id } } }));
          toast(t("deleted", { title: bannerName(dialog.banner) }));
          router.refresh();
        }}
      >
        {dialog?.kind === "delete" && dialog.banner.is_active ? (
          <Button
            variant="secondary"
            onClick={() => {
              const banner = dialog.banner;
              setDialog(null);
              void act(`toggle-${banner.id}`, () => patch(banner.id, { is_active: false }), t("disabled", { title: bannerName(banner) }));
            }}
            data-testid="banner-disable-instead"
          >
            <EyeOff className="size-4" aria-hidden />
            {t("disableInstead")}
          </Button>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
