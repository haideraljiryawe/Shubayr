"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Input, Select } from "@/components/ui";
import { Field } from "@/components/forms/field";
import { FormDialog } from "@/components/forms/form-dialog";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import { bannerName, swapBody, swapCandidates, type Banner } from "@/lib/banners";

/**
 * Replace one default banner with another in a single atomic call
 * (POST /admin/banners/defaults/swap, 17.9.0): the outgoing banner stops being
 * a default in the same transaction that makes the replacement one, so the
 * two-defaults rule never blocks it. The replacement must be enabled and in
 * date now; it takes the outgoing priority unless another is typed.
 */
export function DefaultSwapDialog({
  outgoing,
  banners,
  onClose,
  onSwapped,
}: {
  outgoing: Banner;
  banners: Banner[];
  onClose: () => void;
  onSwapped: (incoming: Banner) => void;
}) {
  const t = useTranslations("banners.swap");
  const api = useApiForm();
  const candidates = swapCandidates(banners, outgoing);
  const [incomingId, setIncomingId] = useState(candidates[0]?.id ?? "");
  const [priority, setPriority] = useState(String(outgoing.default_priority));
  const [problem, setProblem] = useState<"incoming" | "priority" | null>(null);

  async function submit() {
    if (!incomingId) return setProblem("incoming");
    if (priority.trim() && !/^\d{1,6}$/.test(priority.trim())) return setProblem("priority");
    setProblem(null);
    const result = await api.run(() => unwrap(browserApi.POST("/admin/banners/defaults/swap", { body: swapBody(outgoing, incomingId, priority) })));
    if (!result) return;
    const incoming = result.find((banner) => banner.id === incomingId) ?? candidates.find((banner) => banner.id === incomingId);
    if (incoming) onSwapped(incoming);
  }

  return (
    <FormDialog
      open
      title={t("title", { name: bannerName(outgoing) })}
      submitLabel={t("submit")}
      pending={api.pending}
      onSubmit={() => void submit()}
      onClose={onClose}
      testId="banner-swap"
    >
      <p className="text-body text-text-muted">{t("intro")}</p>
      {candidates.length === 0 ? (
        <Alert tone="info" data-testid="banner-swap-none">
          {t("none")}
        </Alert>
      ) : (
        <>
          <Field label={t("incoming")} name="incoming_id" error={problem === "incoming" ? t("pick") : (api.fieldErrors.incoming_id ?? null)}>
            <Select value={incomingId} onValueChange={(value) => setIncomingId(value)} data-testid="banner-swap-incoming">
              {candidates.map((banner) => (
                <option key={banner.id} value={banner.id}>
                  {bannerName(banner)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("priority")} name="default_priority" hint={t("priorityHint")} error={problem === "priority" ? t("priorityInvalid") : (api.fieldErrors.default_priority ?? null)}>
            <Input value={priority} inputMode="numeric" dir="ltr" className="w-32" onChange={(e) => setPriority(e.target.value)} data-testid="banner-swap-priority" />
          </Field>
        </>
      )}
      <FormError kind={api.formError} code={api.formErrorCode} />
    </FormDialog>
  );
}
