"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Card, Input, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { AccessFields } from "@/components/access/access-fields";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { TemporaryPasswordField } from "@/components/forms/password-field";
import { useApiForm } from "@/components/forms/use-api-form";
import type { AccessCatalog } from "@/lib/api/access-catalog";
import { browserApi, unwrap } from "@/lib/api/client";

/**
 * Create a staff account with a temporary password.
 *
 * The API forces a password change at that account's first sign-in. Every
 * input survives a failed submit; a 422 lands under the field it names.
 */
export function StaffCreateForm({
  catalog,
}: {
  catalog: AccessCatalog | null;
}) {
  const t = useTranslations("staff");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const toast = useToast();
  const form = useApiForm();

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [presetIds, setPresetIds] = useState<string[]>([]);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [reason, setReason] = useState("");

  async function submit() {
    const created = await form.run(() =>
      unwrap(
        browserApi.POST("/admin/staff", {
          body: {
            username: username.trim().toLowerCase(),
            name: name.trim(),
            email: email.trim() || null,
            password,
            preset_ids: presetIds,
            permission_keys: permissionKeys,
            reason: reason.trim(),
          },
        }),
      ),
    );
    if (!created) return;
    toast(t("created"));
    router.push(`/staff/${created.id}`);
  }

  return (
    <form
      noValidate
      data-testid="staff-create-form"
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <FormError kind={form.formError} detail={form.formErrorDetail} />

      <Card className="grid gap-5 md:grid-cols-2">
        <Field
          label={t("fields.username")}
          hint={t("fields.usernameHint")}
          error={form.fieldErrors.username}
          name="username"
        >
          <Input
            dir="ltr"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            data-testid="input-username"
            onChange={(event) => {
              setUsername(event.target.value);
              form.clearField("username");
            }}
          />
        </Field>
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
        <TemporaryPasswordField
          value={password}
          error={form.fieldErrors.password}
          onChange={(value) => {
            setPassword(value);
            form.clearField("password");
          }}
        />
      </Card>

      <Card>
        <h2 className="mb-4 text-lg font-bold">{t("accessTitle")}</h2>
        <AccessFields
          catalog={catalog}
          presetIds={presetIds}
          permissionKeys={permissionKeys}
          onPresetIds={setPresetIds}
          onPermissionKeys={setPermissionKeys}
          errors={form.fieldErrors}
        />
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
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => router.push("/staff")}>
            {tCommon("cancel")}
          </Button>
          <Button
            type="submit"
            pending={form.pending}
            data-testid="staff-create-submit"
          >
            {t("create")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
