"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { browserApi, unwrap } from "@/lib/api/client";
import {
  BANNER_STATUSES,
  baghdadText,
  bannerStatus,
  duplicateBody,
  filterBanners,
  nextSortOrder,
  reorderPatches,
  scheduleModeOf,
  type Banner,
  type BannerPatch,
  type BannerStatus,
} from "@/lib/banners";
import { BannerFormDialog } from "./banner-form";
import { STATUS_TONE } from "./status";

type Dialog = { kind: "new" } | { kind: "edit"; banner: Banner } | { kind: "delete"; banner: Banner } | null;

/**
 * The home banners in the order the store shows them. Each row has its
 * picture, title, place, schedule (Asia/Baghdad), link and effective status;
 * edit, switch on/off, move up/down, duplicate (as a disabled copy) and
 * delete — the last behind its own confirmation, distinct from switching off.
 */
export function BannersView({ banners, now }: { banners: Banner[]; now: string }) {
  const t = useTranslations("banners");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [filter, setFilter] = useState<BannerStatus | "">("");
  const [busy, setBusy] = useState<string | null>(null);
  const at = new Date(now);
  const shown = filterBanners(banners, filter, at);

  async function act(key: string, work: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await work();
      toast(done);
      router.refresh();
    } catch {
      toast(t("actionFailed"));
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const patch = (id: string, body: BannerPatch) =>
    unwrap(browserApi.PATCH("/admin/banners/{id}", { params: { path: { id } }, body }));

  function move(banner: Banner, delta: -1 | 1) {
    const index = banners.findIndex((item) => item.id === banner.id);
    const writes = reorderPatches(banners, index, delta);
    void act(
      `move-${banner.id}`,
      async () => {
        // One at a time: each write is small, and a failure stops the rest.
        for (const write of writes) await patch(write.id, { sort_order: write.sort_order });
      },
      t("moved", { title: banner.title }),
    );
  }

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
          <Select value={filter} onChange={(e) => setFilter(e.target.value as BannerStatus | "")} data-testid="banner-filter">
            <option value="">{t("filter.all", { count: banners.length })}</option>
            {BANNER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`statuses.${status}`)} ({filterBanners(banners, status, at).length})
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

      {shown.length === 0 ? (
        <Card className="text-sm text-text-muted" data-testid="banners-empty">
          {banners.length === 0 ? t("empty") : t("emptyFilter")}
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="banner-list">
          {shown.map((banner) => {
            const index = banners.findIndex((item) => item.id === banner.id);
            const status = bannerStatus(banner, at);
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
                        {banner.title}
                      </span>
                      <Badge tone={STATUS_TONE[status]} data-testid="banner-status">
                        {t(`statuses.${status}`)}
                      </Badge>
                    </span>
                    {banner.subtitle ? (
                      <span className="line-clamp-1 text-sm text-text-muted" dir="auto">
                        {banner.subtitle}
                      </span>
                    ) : null}
                    <span className="text-xs text-text-muted" data-testid="banner-position">
                      {t("position", { number: index + 1, total: banners.length, order: banner.sort_order })}
                    </span>
                    <span className="text-xs text-text-muted" data-testid="banner-schedule-text">
                      {scheduleText(banner)}
                    </span>
                    <span className="text-xs text-text-muted" data-testid="banner-link-text">
                      {banner.link_url ? (
                        <>
                          {t("linkTo")}{" "}
                          <span dir="ltr" className="break-all">
                            {banner.link_url}
                          </span>
                          {banner.cta_text ? ` · ${t("buttonLabel", { label: banner.cta_text })}` : ""}
                        </>
                      ) : (
                        t("noAction")
                      )}
                    </span>
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
                      disabled={pending}
                      pending={busy === `toggle-${banner.id}`}
                      onClick={() =>
                        void act(
                          `toggle-${banner.id}`,
                          () => patch(banner.id, { is_active: !banner.is_active }),
                          banner.is_active ? t("disabled", { title: banner.title }) : t("enabled", { title: banner.title }),
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
                          t("duplicated", { title: banner.title }),
                        )
                      }
                      data-testid="banner-duplicate"
                    >
                      <Copy className="size-4" aria-hidden />
                      {t("duplicate")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-error-dark"
                      disabled={pending}
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
          onClose={() => setDialog(null)}
          onSaved={(saved, created) => {
            toast(created ? t("created", { title: saved.title }) : t("saved", { title: saved.title }));
            setDialog(null);
            router.refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={dialog?.kind === "delete"}
        title={t("deleteTitle", { title: dialog?.kind === "delete" ? dialog.banner.title : "" })}
        body={t("deleteBody")}
        confirmLabel={t("deleteConfirm")}
        requireReason={false}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (dialog?.kind !== "delete") return;
          await unwrap(browserApi.DELETE("/admin/banners/{id}", { params: { path: { id: dialog.banner.id } } }));
          toast(t("deleted", { title: dialog.banner.title }));
          router.refresh();
        }}
      >
        {dialog?.kind === "delete" && dialog.banner.is_active ? (
          <Button
            variant="secondary"
            onClick={() => {
              const banner = dialog.banner;
              setDialog(null);
              void act(`toggle-${banner.id}`, () => patch(banner.id, { is_active: false }), t("disabled", { title: banner.title }));
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
