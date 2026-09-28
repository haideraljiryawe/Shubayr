"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { PermissionPicker } from "@/components/access/permission-picker";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import { browserApi, unwrap } from "@/lib/api/client";
import {
  presetKeys,
  type Permission,
  type PermissionPreset,
} from "@/lib/permissions";

/** Create or edit a preset: a name, a description and a set of permissions. */
export function PresetForm({
  registry,
  preset,
}: {
  registry: Permission[];
  preset: PermissionPreset | null;
}) {
  const t = useTranslations("presets");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const form = useApiForm();

  const [name, setName] = useState(preset?.name ?? "");
  const [description, setDescription] = useState(preset?.description ?? "");
  const [keys, setKeys] = useState<string[]>(
    preset ? presetKeys(preset).sort() : [],
  );
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function submit() {
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      permission_keys: keys,
      reason: reason.trim(),
    };
    const saved = await form.run(() =>
      unwrap(
        preset
          ? browserApi.PATCH("/admin/presets/{id}", {
              params: { path: { id: preset.id } },
              body,
            })
          : browserApi.POST("/admin/presets", { body }),
      ),
    );
    if (!saved) return;
    toast(preset ? t("saved") : t("created"));
    setReason("");
    if (preset) router.refresh();
    else router.push(`/presets/${saved.id}`);
  }

  return (
    <>
      <form
        noValidate
        className="flex flex-col gap-6"
        data-testid="preset-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormError kind={form.formError} detail={form.formErrorDetail} />
        <Card className="grid gap-4 md:grid-cols-2">
          <Field
            label={t("fields.name")}
            hint={t("fields.nameHint")}
            error={form.fieldErrors.name}
            name="name"
          >
            <Input
              dir="ltr"
              autoCapitalize="none"
              spellCheck={false}
              value={name}
              data-testid="input-name"
              onChange={(event) => {
                setName(event.target.value);
                form.clearField("name");
              }}
            />
          </Field>
          <Field
            label={t("fields.description")}
            error={form.fieldErrors.description}
            name="description"
          >
            <Input
              value={description}
              maxLength={255}
              data-testid="input-description"
              onChange={(event) => {
                setDescription(event.target.value);
                form.clearField("description");
              }}
            />
          </Field>
        </Card>

        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="text-lg font-bold">{t("permissionsTitle")}</h2>
            <p className="text-sm text-text-muted">
              {t("permissionsHint", { count: keys.length })}
            </p>
          </div>
          <PermissionPicker
            registry={registry}
            value={keys}
            onChange={setKeys}
          />
          {form.fieldErrors.permission_keys ? (
            <p
              className="text-xs font-semibold text-error-dark"
              data-testid="error-permission_keys"
            >
              {form.fieldErrors.permission_keys}
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-4">
          <Field
            label={tCommon("reason")}
            hint={tCommon("reasonHint")}
            error={form.fieldErrors.reason}
            name="reason"
          >
            <Textarea
              value={reason}
              maxLength={500}
              data-testid="input-reason"
              onChange={(event) => {
                setReason(event.target.value);
                form.clearField("reason");
              }}
            />
          </Field>
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              {preset && !preset.is_system ? (
                <Button
                  variant="danger"
                  onClick={() => setConfirmDelete(true)}
                  data-testid="preset-delete"
                >
                  {t("delete")}
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => router.push("/presets")}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="submit"
                pending={form.pending}
                data-testid="preset-save"
              >
                {preset ? tCommon("save") : t("create")}
              </Button>
            </div>
          </div>
        </Card>
      </form>

      {/* Outside the <form>: the dialog has its own form, and a nested one
          would bubble its submit into this form's save. */}
      {preset ? (
        <ConfirmDialog
          open={confirmDelete}
          title={t("deleteTitle", { name: preset.name })}
          body={t("deleteBody")}
          confirmLabel={t("delete")}
          onClose={() => setConfirmDelete(false)}
          onConfirm={async (deleteReason) => {
            await unwrap(
              browserApi.DELETE("/admin/presets/{id}", {
                params: {
                  path: { id: preset.id },
                  query: { reason: deleteReason },
                },
              }),
            );
            toast(t("deleted"));
            router.push("/presets");
          }}
        />
      ) : null}
    </>
  );
}
