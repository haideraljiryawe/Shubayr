"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Alert, Badge, Input, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { EditorialHint } from "@/components/forms/editorial-hint";
import { BannerPreview } from "@/components/catalog/banner-preview";
import { CroppedImageField, type ImageChoice } from "@/components/catalog/cropped-image-field";
import { browserApi, unwrap } from "@/lib/api/client";
import {
  CTA_MAX,
  TITLE_MAX,
  baghdadText,
  bannerStatus,
  createBody,
  formFromBanner,
  modeChoices,
  patchBody,
  scheduleOf,
  switchMode,
  validateBanner,
  type Banner,
  type BannerForm as Form,
  type BannerProblem,
  type ScheduleMode,
} from "@/lib/banners";
import { BANNER_SUBTITLE_GUIDE, BANNER_TITLE_GUIDE } from "@/lib/editorial";
import { BANNER_CROP } from "@/lib/image-crop";
import { uploadImage } from "@/lib/media-upload";
import { MAX_UPLOAD_BYTES } from "@/lib/product-images";
import { STATUS_TONE } from "./status";

/**
 * Create or edit one banner. Only changed fields are sent on edit. A new
 * picture is uploaded when the form saves; if the upload or the save fails,
 * the banner keeps its picture and saving can be retried (an upload that
 * went through is not sent twice).
 */
export function BannerFormDialog({
  original,
  nextSortOrder,
  onClose,
  onSaved,
}: {
  original: Banner | null;
  nextSortOrder: number;
  onClose: () => void;
  onSaved: (banner: Banner, created: boolean) => void;
}) {
  const t = useTranslations("banners");
  const tImage = useTranslations("imageEditor");
  const locale = useLocale();
  const api = useApiForm();
  const [form, setForm] = useState<Form>(formFromBanner(original));
  const [image, setImage] = useState<ImageChoice>({ kind: "keep" });
  const [uploaded, setUploaded] = useState<{ blob: Blob; url: string } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [problems, setProblems] = useState<BannerProblem[]>([]);
  const [noChanges, setNoChanges] = useState(false);

  const set = (patch: Partial<Form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setNoChanges(false);
  };
  const problem = (field: BannerProblem["field"]) => {
    const found = problems.find((item) => item.field === field);
    return found ? t(`errors.${field}.${found.kind}`) : (api.fieldErrors[apiField(field)] ?? null);
  };
  const hasImage = image.kind === "new" || Boolean(original?.image_url);

  // What saving would do to the dates already stored, and the status it gives.
  const schedule = scheduleOf(form);
  const dropsStart = original?.starts_at && !schedule.starts_at ? original.starts_at : null;
  const dropsEnd = original?.ends_at && !schedule.ends_at ? original.ends_at : null;
  const datesValid = validateBanner(form, { hasImage: true }).every((item) => item.field !== "starts" && item.field !== "ends");
  const outcome = datesValid ? bannerStatus({ is_active: form.isActive, ...schedule }, new Date()) : null;

  async function imageUrl(): Promise<string | null> {
    if (image.kind !== "new") return original?.image_url ?? null;
    if (uploaded?.blob === image.cropped.blob) return uploaded.url;
    setUploadFailed(false);
    setProgress(0);
    try {
      const media = await uploadImage(image.cropped.blob, image.cropped.name, setProgress);
      setUploaded({ blob: image.cropped.blob, url: media.public_url });
      return media.public_url;
    } catch {
      setUploadFailed(true);
      return null;
    } finally {
      setProgress(null);
    }
  }

  async function submit() {
    const found = validateBanner(form, { hasImage });
    setProblems(found);
    if (found.length) return;
    if (original) {
      // Nothing changed and no new picture: say so instead of sending an empty PATCH.
      if (image.kind !== "new" && patchBody(form, original, original.image_url) === null) {
        setNoChanges(true);
        return;
      }
    }
    const url = await imageUrl();
    if (!url) return;
    const saved = await api.run(() => {
      if (!original) return unwrap(browserApi.POST("/admin/banners", { body: createBody(form, url, nextSortOrder) }));
      const body = patchBody(form, original, url);
      return body
        ? unwrap(browserApi.PATCH("/admin/banners/{id}", { params: { path: { id: original.id } }, body }))
        : Promise.resolve(original);
    });
    if (saved) onSaved(saved, !original);
  }

  const modes = modeChoices(original);

  return (
    <FormDialog
      open
      wide
      title={original ? t("form.editTitle", { title: original.title }) : t("form.newTitle")}
      submitLabel={original ? t("form.save") : t("form.create")}
      pending={api.pending || progress !== null}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="banner-form"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label={t("form.title")}
          name="title"
          error={problem("title")}
          hint={<EditorialHint text={form.title} guide={BANNER_TITLE_GUIDE} testId="banner-title-guide" />}
        >
          <Input value={form.title} dir="auto" onChange={(e) => set({ title: e.target.value })} data-testid="banner-title" />
        </Field>
        <Field
          label={t("form.subtitle")}
          name="subtitle"
          hint={<EditorialHint text={form.subtitle} guide={BANNER_SUBTITLE_GUIDE} testId="banner-subtitle-guide" />}
        >
          <Textarea value={form.subtitle} dir="auto" rows={2} onChange={(e) => set({ subtitle: e.target.value })} data-testid="banner-subtitle" />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-text-muted">{t("form.oneLanguage", { max: TITLE_MAX })}</p>

      <CroppedImageField
        label={t("form.image")}
        savedUrl={original?.image_url ?? null}
        value={image}
        onChange={(next) => {
          setImage(next);
          setUploadFailed(false);
          setNoChanges(false);
        }}
        target={BANNER_CROP}
        keepTransparency={false}
        removable={false}
        safeArea
        guidance={tImage("bannerGuidance", { width: BANNER_CROP.width, height: BANNER_CROP.width / 2, mb: MAX_UPLOAD_BYTES / 1024 / 1024 })}
        preview={(url) => (
          <BannerPreview imageUrl={url} title={form.title.trim()} subtitle={form.subtitle.trim()} cta={form.ctaText} hasLink={form.linkUrl.trim() !== ""} />
        )}
        testId="banner-image"
      />
      {problem("image") ? (
        <p className="-mt-2 text-sm font-semibold text-error-dark" data-testid="banner-image-required">
          {problem("image")}
        </p>
      ) : null}
      {progress !== null ? <p className="text-sm text-text-muted">{tImage("uploading", { percent: progress })}</p> : null}
      {uploadFailed ? <Alert data-testid="banner-image-upload-failed">{tImage("uploadFailed")}</Alert> : null}

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3" data-testid="banner-click">
        <legend className="px-1 text-sm font-semibold">{t("form.onClick")}</legend>
        <p className="flex items-start gap-2 text-xs text-text-muted" data-testid="banner-actions-later">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("form.actionsLater")}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t("form.link")} name="link_url" error={problem("linkUrl")} hint={t("form.linkHint")}>
            <Input value={form.linkUrl} dir="ltr" inputMode="url" placeholder="https://" onChange={(e) => set({ linkUrl: e.target.value })} data-testid="banner-link" />
          </Field>
          <Field label={t("form.cta")} name="cta_text" error={problem("ctaText")} hint={t("form.ctaHint", { max: CTA_MAX })}>
            <Input value={form.ctaText} dir="auto" onChange={(e) => set({ ctaText: e.target.value })} data-testid="banner-cta" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3" data-testid="banner-schedule">
        <legend className="px-1 text-sm font-semibold">{t("form.display")}</legend>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={form.isActive} onChange={(e) => set({ isActive: e.target.checked })} data-testid="banner-enabled" />
          {t("form.enabled")}
        </label>
        <p className="-mt-2 text-xs text-text-muted">{t("form.enabledHint")}</p>

        <div className="flex flex-wrap gap-4" role="radiogroup" aria-label={t("form.scheduleMode")}>
          {modes.map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="banner-mode"
                checked={form.mode === mode}
                onChange={() => set(switchMode(form, mode as ScheduleMode).form)}
                data-testid={`banner-mode-${mode}`}
              />
              {t(`modes.${mode}`)}
            </label>
          ))}
        </div>
        {form.mode === "startOnly" || form.mode === "endOnly" ? (
          <p className="text-xs text-text-muted" data-testid="banner-mode-partial">
            {t("form.partialNote")}
          </p>
        ) : null}

        {form.mode !== "permanent" ? (
          <div className="grid gap-4 md:grid-cols-2">
            {form.mode !== "endOnly" ? (
              <Field label={t("form.starts")} name="starts_at" error={problem("starts")} hint={t("form.baghdad")}>
                <Input type="datetime-local" value={form.starts} onChange={(e) => set({ starts: e.target.value })} data-testid="banner-starts" />
              </Field>
            ) : null}
            {form.mode !== "startOnly" ? (
              <Field label={t("form.ends")} name="ends_at" error={problem("ends")} hint={t("form.baghdad")}>
                <Input type="datetime-local" value={form.ends} onChange={(e) => set({ ends: e.target.value })} data-testid="banner-ends" />
              </Field>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-text-muted">{t("form.permanentHint")}</p>
        )}

        {dropsStart || dropsEnd ? (
          <Alert tone="info" data-testid="banner-schedule-drops">
            {dropsStart ? <span className="block">{t("form.dropsStart", { at: baghdadText(dropsStart, locale) })}</span> : null}
            {dropsEnd ? <span className="block">{t("form.dropsEnd", { at: baghdadText(dropsEnd, locale) })}</span> : null}
          </Alert>
        ) : null}
        {outcome ? (
          <p className="flex items-center gap-2 text-sm" data-testid="banner-outcome" data-status={outcome}>
            {t("form.outcome")} <Badge tone={STATUS_TONE[outcome]}>{t(`statuses.${outcome}`)}</Badge>
          </p>
        ) : null}
      </fieldset>

      {noChanges ? (
        <Alert tone="info" data-testid="banner-no-changes">
          {t("form.noChanges")}
        </Alert>
      ) : null}
      <FormError kind={api.formError} code={api.formErrorCode} />
    </FormDialog>
  );
}

function apiField(field: BannerProblem["field"]): string {
  return { title: "title", ctaText: "cta_text", linkUrl: "link_url", starts: "starts_at", ends: "ends_at", image: "image_url" }[field];
}
