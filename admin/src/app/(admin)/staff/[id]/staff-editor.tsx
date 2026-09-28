"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { AccessFields } from "@/components/access/access-fields";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { TemporaryPasswordField } from "@/components/forms/password-field";
import { useApiForm } from "@/components/forms/use-api-form";
import type { AccessCatalog } from "@/lib/api/access-catalog";
import { browserApi, unwrap } from "@/lib/api/client";
import { ApiError, fieldErrorMap } from "@/lib/api/errors";
import { isStrongPassword } from "@/lib/password";
import type { StaffUser } from "@/lib/staff-query";
import { StaffStatus } from "../staff-table";

/**
 * One staff account: profile, access, and the two destructive actions.
 *
 * Each section saves on its own with its own audit reason, because the API
 * records each change separately (PATCH, PUT access, POST password) and a
 * failure in one must not lose what was typed in another.
 */
export function StaffEditor({
  user,
  catalog,
}: {
  user: StaffUser;
  catalog: AccessCatalog | null;
}) {
  const t = useTranslations("staff");
  const router = useRouter();
  const toast = useToast();

  const [dialog, setDialog] = useState<
    "deactivate" | "reactivate" | "password" | null
  >(null);
  const [tempPassword, setTempPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function saved(message: string) {
    toast(message);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6" data-testid="staff-editor">
      <ProfileSection user={user} onSaved={() => saved(t("savedProfile"))} />
      <AccessSection
        user={user}
        catalog={catalog}
        onSaved={() => saved(t("savedAccess"))}
      />

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{t("accountTitle")}</h2>
            <p className="text-sm text-text-muted">{t("accountHint")}</p>
          </div>
          <StaffStatus user={user} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setDialog("password")}
            data-testid="staff-reset-password"
          >
            {t("resetPassword")}
          </Button>
          {user.is_active ? (
            <Button
              variant="danger"
              onClick={() => setDialog("deactivate")}
              data-testid="staff-deactivate"
            >
              {t("deactivate")}
            </Button>
          ) : (
            <Button
              onClick={() => setDialog("reactivate")}
              data-testid="staff-reactivate"
            >
              {t("reactivate")}
            </Button>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={dialog === "deactivate" || dialog === "reactivate"}
        title={
          dialog === "reactivate" ? t("reactivateTitle") : t("deactivateTitle")
        }
        body={
          dialog === "reactivate" ? t("reactivateBody") : t("deactivateBody")
        }
        confirmLabel={
          dialog === "reactivate" ? t("reactivate") : t("deactivate")
        }
        tone={dialog === "reactivate" ? "primary" : "danger"}
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          await unwrap(
            browserApi.PATCH("/admin/staff/{id}", {
              params: { path: { id: user.id } },
              body: { is_active: dialog === "reactivate", reason },
            }),
          );
          saved(dialog === "reactivate" ? t("reactivated") : t("deactivated"));
        }}
      />

      <ConfirmDialog
        open={dialog === "password"}
        title={t("resetPasswordTitle")}
        body={t("resetPasswordBody")}
        confirmLabel={t("resetPassword")}
        onClose={() => {
          setDialog(null);
          setTempPassword("");
          setPasswordError(null);
        }}
        onConfirm={async (reason) => {
          if (!isStrongPassword(tempPassword)) {
            setPasswordError(t("passwordWeak"));
            throw new ApiError(422, t("passwordWeak"), "VALIDATION_FAILED");
          }
          try {
            await unwrap(
              browserApi.POST("/admin/staff/{id}/password", {
                params: { path: { id: user.id } },
                body: { password: tempPassword, reason },
              }),
            );
          } catch (cause) {
            if (cause instanceof ApiError)
              setPasswordError(fieldErrorMap(cause.errors).password ?? null);
            throw cause;
          }
          setTempPassword("");
          saved(t("passwordReset"));
        }}
      >
        <TemporaryPasswordField
          name="reset-password"
          value={tempPassword}
          error={passwordError}
          onChange={(value) => {
            setTempPassword(value);
            setPasswordError(null);
          }}
        />
      </ConfirmDialog>
    </div>
  );
}

function ProfileSection({
  user,
  onSaved,
}: {
  user: StaffUser;
  onSaved: () => void;
}) {
  const t = useTranslations("staff");
  const tCommon = useTranslations("common");
  const form = useApiForm();
  const [name, setName] = useState(user.name ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [reason, setReason] = useState("");

  async function submit() {
    const result = await form.run(() =>
      unwrap(
        browserApi.PATCH("/admin/staff/{id}", {
          params: { path: { id: user.id } },
          body: {
            name: name.trim(),
            email: email.trim() || null,
            reason: reason.trim(),
          },
        }),
      ),
    );
    if (result) {
      setReason("");
      onSaved();
    }
  }

  return (
    <Card>
      <form
        noValidate
        className="flex flex-col gap-4"
        data-testid="staff-profile-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-lg font-bold">{t("profileTitle")}</h2>
        <FormError kind={form.formError} detail={form.formErrorDetail} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label={t("fields.name")}
            error={form.fieldErrors.name}
            name="name"
          >
            <Input
              value={name}
              data-testid="input-name"
              onChange={(event) => {
                setName(event.target.value);
                form.clearField("name");
              }}
            />
          </Field>
          <Field
            label={t("fields.email")}
            error={form.fieldErrors.email}
            name="email"
          >
            <Input
              type="email"
              dir="ltr"
              value={email}
              data-testid="input-email"
              onChange={(event) => {
                setEmail(event.target.value);
                form.clearField("email");
              }}
            />
          </Field>
        </div>
        <Field
          label={tCommon("reason")}
          hint={tCommon("reasonHint")}
          error={form.fieldErrors.reason}
          name="reason"
        >
          <Textarea
            value={reason}
            maxLength={500}
            data-testid="profile-reason"
            onChange={(event) => {
              setReason(event.target.value);
              form.clearField("reason");
            }}
          />
        </Field>
        <div className="flex justify-end">
          <Button
            type="submit"
            pending={form.pending}
            data-testid="profile-save"
          >
            {tCommon("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AccessSection({
  user,
  catalog,
  onSaved,
}: {
  user: StaffUser;
  catalog: AccessCatalog | null;
  onSaved: () => void;
}) {
  const t = useTranslations("staff");
  const tCommon = useTranslations("common");
  const form = useApiForm();
  const [presetIds, setPresetIds] = useState(
    user.presets.map((preset) => preset.id),
  );
  const [permissionKeys, setPermissionKeys] = useState(
    [...user.extra_grants].sort(),
  );
  const [reason, setReason] = useState("");

  async function submit() {
    const result = await form.run(() =>
      unwrap(
        browserApi.PUT("/admin/staff/{id}/access", {
          params: { path: { id: user.id } },
          body: {
            preset_ids: presetIds,
            permission_keys: permissionKeys,
            reason: reason.trim(),
          },
        }),
      ),
    );
    if (result) {
      setReason("");
      onSaved();
    }
  }

  return (
    <Card>
      <form
        noValidate
        className="flex flex-col gap-4"
        data-testid="staff-access-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <h2 className="text-lg font-bold">{t("accessTitle")}</h2>
          <p className="text-sm text-text-muted">{t("accessHint")}</p>
        </div>
        <FormError kind={form.formError} detail={form.formErrorDetail} />
        <AccessFields
          catalog={catalog}
          presetIds={presetIds}
          permissionKeys={permissionKeys}
          onPresetIds={setPresetIds}
          onPermissionKeys={setPermissionKeys}
          errors={form.fieldErrors}
        />
        {catalog ? (
          <>
            <Field
              label={tCommon("reason")}
              hint={tCommon("reasonHint")}
              error={form.fieldErrors.reason}
              name="reason"
            >
              <Textarea
                value={reason}
                maxLength={500}
                data-testid="access-reason"
                onChange={(event) => {
                  setReason(event.target.value);
                  form.clearField("reason");
                }}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="submit"
                pending={form.pending}
                data-testid="access-save"
              >
                {t("saveAccess")}
              </Button>
            </div>
          </>
        ) : null}
      </form>
    </Card>
  );
}
