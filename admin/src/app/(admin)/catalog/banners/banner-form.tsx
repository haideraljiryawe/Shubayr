"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Alert, Badge, Input, Select, Textarea } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { EditorialHint } from "@/components/forms/editorial-hint";
import { BannerPreview } from "@/components/catalog/banner-preview";
import { BannerTargetPicker, type CategoryOption } from "@/components/catalog/banner-target-picker";
import { CroppedImageField, type ImageChoice } from "@/components/catalog/cropped-image-field";
import { browserApi, unwrap } from "@/lib/api/client";
import {
  BANNER_ACTIONS,
  CTA_MAX,
  TITLE_MAX,
  baghdadText,
  bannerName,
  createBody,
  formFromBanner,
  formTarget,
  modeChoices,
  patchBody,
  scheduleOf,
  switchMode,
  targetName,
  validateBanner,
  type Banner,
  type BannerActionType,
  type BannerForm as Form,
  type BannerProblem,
  type ScheduleMode,
} from "@/lib/banners";
import { BANNER_SUBTITLE_GUIDE, BANNER_TITLE_GUIDE } from "@/lib/editorial";
import { BANNER_CROP } from "@/lib/image-crop";
import { discardUploads, orphanedUploads } from "@/lib/media-cleanup";
import { uploadImage } from "@/lib/media-upload";
import { MAX_UPLOAD_BYTES } from "@/lib/product-images";
import { STATUS_TONE } from "./status";

/**
 * Create or edit one banner. Only changed fields are sent on edit. A new
 * picture is uploaded when the form saves; if the save fails, the upload is
 * kept for the retry (it is not sent twice). Uploads the saved banner does
 * not use — a replaced crop, or everything when the form is cancelled — are
 * deleted again (DELETE /media/{id}; the API keeps anything still in use).
 */
export function BannerFormDialog({
  original,
  nextSortOrder,
  categories,
  onClose,
  onSaved,
}: {
  original: Banner | null;
  nextSortOrder: number;
  categories: CategoryOption[];
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
  const uploads = useRef<string[]>([]);
  const settled = useRef(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [problems, setProblems] = useState<BannerProblem[]>([]);
  const [noChanges, setNoChanges] = useState(false);
  const [previewLanguage, setPreviewLanguage] = useState<"ar" | "en">(locale === "en" ? "en" : "ar");

  const set = (patch: Partial<Form>) => {
    setForm((current) => ({ ...current, ...patch }));
    setNoChanges(false);
  };
  const problem = (field: BannerProblem["field"]) => {
    const found = problems.find((item) => item.field === field);
    return found ? t(`errors.${field}.${found.kind}`) : (api.fieldErrors[apiField(field)] ?? null);
  };
  const hasImage = image.kind === "new" || Boolean(original?.image_url);

  // What saving would do to the dates already stored.
  const schedule = scheduleOf(form);
  const dropsStart = original?.starts_at && !schedule.starts_at ? original.starts_at : null;
  const dropsEnd = original?.ends_at && !schedule.ends_at ? original.ends_at : null;

  // The preview shows one language with the API's fallback applied.
  const pick = (ar: string, en: string) => (previewLanguage === "ar" ? ar.trim() || en.trim() : en.trim() || ar.trim());
  const target = formTarget(form);
  const destination =
    form.action === "url"
      ? form.linkUrl.trim()
      : form.action === "offers"
        ? t("actions.offers")
        : target
          ? targetName(target, locale)
          : t("target.notChosen");

  async function imageUrl(): Promise<string | null> {
    if (image.kind !== "new") return original?.image_url ?? null;
    if (uploaded?.blob === image.cropped.blob) return uploaded.url;
    setUploadFailed(false);
    setProgress(0);
    try {
      const media = await uploadImage(image.cropped.blob, image.cropped.name, setProgress);
      uploads.current.push(media.public_url);
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
    const allowStoredLegacyTitle = Boolean(
      original?.title.trim() && !original.title_ar && !original.title_en,
    );
    const found = validateBanner(form, { hasImage, allowStoredLegacyTitle });
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
    if (!saved) return;
    settled.current = true;
    void discardUploads(orphanedUploads(uploads.current, [saved.image_url, original?.image_url]));
    onSaved(saved, !original);
  }

  function close() {
    if (!settled.current) {
      settled.current = true;
      void discardUploads(orphanedUploads(uploads.current, [original?.image_url]));
    }
    onClose();
  }

  const modes = modeChoices(original);

  return (
    <FormDialog
      open
      wide
      title={original ? t("form.editTitle", { title: bannerName(original) }) : t("form.newTitle")}
      submitLabel={original ? t("form.save") : t("form.create")}
      pending={api.pending || progress !== null}
      onSubmit={() => void submit()}
      onClose={close}
      testId="banner-form"
    >
      <Field label={t("form.internalName")} name="internal_name" error={problem("internalName")} hint={t("form.internalNameHint")}>
        <Input value={form.internalName} dir="auto" onChange={(e) => set({ internalName: e.target.value })} data-testid="banner-internal-name" />
      </Field>

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3" data-testid="banner-text">
        <legend className="px-1 text-sm font-semibold">{t("form.text")}</legend>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={form.showText} onChange={(e) => set({ showText: e.target.checked })} data-testid="banner-show-text" />
          {t("form.showText")}
        </label>
        <p className="-mt-2 text-xs text-text-muted">{form.showText ? t("form.showTextHint") : t("form.imageOnlyHint")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label={t("form.titleAr")}
            name="title_ar"
            error={problem("titleAr") ?? problem("title")}
            hint={<EditorialHint text={form.titleAr} guide={BANNER_TITLE_GUIDE} testId="banner-title-ar-guide" />}
          >
            <Input value={form.titleAr} dir="rtl" lang="ar" onChange={(e) => set({ titleAr: e.target.value })} data-testid="banner-title-ar" />
          </Field>
          <Field
            label={t("form.titleEn")}
            name="title_en"
            error={problem("titleEn")}
            hint={<EditorialHint text={form.titleEn} guide={BANNER_TITLE_GUIDE} testId="banner-title-en-guide" />}
          >
            <Input value={form.titleEn} dir="ltr" lang="en" onChange={(e) => set({ titleEn: e.target.value })} data-testid="banner-title-en" />
          </Field>
          <Field label={t("form.subtitleAr")} name="subtitle_ar" hint={<EditorialHint text={form.subtitleAr} guide={BANNER_SUBTITLE_GUIDE} testId="banner-subtitle-ar-guide" />}>
            <Textarea value={form.subtitleAr} dir="rtl" lang="ar" rows={2} onChange={(e) => set({ subtitleAr: e.target.value })} data-testid="banner-subtitle-ar" />
          </Field>
          <Field label={t("form.subtitleEn")} name="subtitle_en" hint={<EditorialHint text={form.subtitleEn} guide={BANNER_SUBTITLE_GUIDE} testId="banner-subtitle-en-guide" />}>
            <Textarea value={form.subtitleEn} dir="ltr" lang="en" rows={2} onChange={(e) => set({ subtitleEn: e.target.value })} data-testid="banner-subtitle-en" />
          </Field>
          <Field label={t("form.ctaAr")} name="cta_label_ar" error={problem("ctaAr")} hint={t("form.ctaHint", { max: CTA_MAX })}>
            <Input value={form.ctaAr} dir="rtl" lang="ar" onChange={(e) => set({ ctaAr: e.target.value })} data-testid="banner-cta-ar" />
          </Field>
          <Field label={t("form.ctaEn")} name="cta_label_en" error={problem("ctaEn")} hint={t("form.ctaHint", { max: CTA_MAX })}>
            <Input value={form.ctaEn} dir="ltr" lang="en" onChange={(e) => set({ ctaEn: e.target.value })} data-testid="banner-cta-en" />
          </Field>
        </div>
        <p className="flex items-start gap-2 text-xs text-text-muted" data-testid="banner-fallback-note">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("form.fallback", { max: TITLE_MAX })}
        </p>
      </fieldset>

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
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-xs" role="radiogroup" aria-label={t("form.previewLanguage")}>
              <span className="font-semibold">{t("form.previewLanguage")}</span>
              {(["ar", "en"] as const).map((language) => (
                <label key={language} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="banner-preview-language"
                    checked={previewLanguage === language}
                    onChange={() => setPreviewLanguage(language)}
                    data-testid={`banner-preview-${language}`}
                  />
                  {t(`form.language.${language}`)}
                </label>
              ))}
            </div>
            <BannerPreview
              imageUrl={url}
              title={pick(form.titleAr, form.titleEn)}
              subtitle={pick(form.subtitleAr, form.subtitleEn)}
              cta={pick(form.ctaAr, form.ctaEn)}
              showText={form.showText}
              action={form.action}
              destination={destination}
              language={previewLanguage}
            />
          </div>
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
        <Field label={t("form.action")} name="action_type" hint={t(`actionHints.${form.action}`)}>
          <Select value={form.action} onChange={(e) => set({ action: e.target.value as BannerActionType })} data-testid="banner-action">
            {BANNER_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {t(`actions.${action}`)}
              </option>
            ))}
          </Select>
        </Field>
        {form.action === "url" ? (
          <Field label={t("form.link")} name="link_url" error={problem("linkUrl")} hint={t("form.linkHint")}>
            <Input value={form.linkUrl} dir="ltr" inputMode="url" placeholder="https://" onChange={(e) => set({ linkUrl: e.target.value })} data-testid="banner-link" />
          </Field>
        ) : null}
        {form.action === "product" || form.action === "category" ? (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">{t(`target.label.${form.action}`)}</span>
            <BannerTargetPicker
              key={form.action}
              kind={form.action}
              value={target}
              categories={categories}
              onChange={(picked) => set(form.action === "product" ? { product: picked } : { category: picked })}
            />
            {problem("target") ? (
              <p className="text-sm font-semibold text-error-dark" data-testid="banner-target-required">
                {problem("target")}
              </p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3" data-testid="banner-default">
        <legend className="px-1 text-sm font-semibold">{t("form.defaultLegend")}</legend>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={form.isDefault} onChange={(e) => set({ isDefault: e.target.checked })} data-testid="banner-is-default" />
          {t("form.isDefault")}
        </label>
        <p className="-mt-2 text-xs text-text-muted" data-testid="banner-default-rule">
          {t("form.defaultRule")}
        </p>
        {form.isDefault ? (
          <Field label={t("form.defaultPriority")} name="default_priority" error={problem("defaultPriority")} hint={t("form.defaultPriorityHint")}>
            <Input
              value={form.defaultPriority}
              inputMode="numeric"
              dir="ltr"
              className="w-32"
              onChange={(e) => set({ defaultPriority: e.target.value })}
              data-testid="banner-default-priority"
            />
          </Field>
        ) : null}
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
        {original ? (
          <p className="flex items-center gap-2 text-sm" data-testid="banner-current-status" data-status={original.effective_status}>
            {t("form.currentStatus")} <Badge tone={STATUS_TONE[original.effective_status]}>{t(`statuses.${original.effective_status}`)}</Badge>
          </p>
        ) : null}
        <p className="text-xs text-text-muted">{t("form.statusFromServer")}</p>
      </fieldset>

      {noChanges ? (
        <Alert tone="info" data-testid="banner-no-changes">
          {t("form.noChanges")}
        </Alert>
      ) : null}
      {api.formErrorCode === "BANNER_DEFAULT_MINIMUM_REQUIRED" ? (
        <Alert data-testid="banner-default-refused">
          <p className="font-semibold">{t("defaultRefused")}</p>
        </Alert>
      ) : (
        <FormError kind={api.formError} code={api.formErrorCode} />
      )}
    </FormDialog>
  );
}

function apiField(field: BannerProblem["field"]): string {
  return {
    internalName: "internal_name",
    title: "title",
    titleAr: "title_ar",
    titleEn: "title_en",
    ctaAr: "cta_label_ar",
    ctaEn: "cta_label_en",
    linkUrl: "link_url",
    target: "action_target_id",
    defaultPriority: "default_priority",
    starts: "starts_at",
    ends: "ends_at",
    image: "image_url",
  }[field];
}
