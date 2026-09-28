"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Card, Input, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog } from "@/components/forms/confirm-dialog";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useApiForm } from "@/components/forms/use-api-form";
import {
  DataTable,
  TableFilter,
  TableSearch,
  type Column,
  type TableState,
} from "@/components/table/data-table";
import { browserApi, unwrap } from "@/lib/api/client";
import { isE164, toE164 } from "@/lib/phone";
import {
  WORK_ROLES,
  type WorkPhoneRow,
  type WorkRole,
} from "@/lib/work-phones";

/**
 * Work phones: register a number as a delivery agent or order monitor (with
 * the person's name as their profile), change its role by registering it
 * again, and revoke it. The API refuses a number that already belongs to a
 * customer (409 CUSTOMER_PHONE_ALREADY_REGISTERED); a revocation stops the
 * phone's sessions on their next request.
 */
export function WorkPhonesView({
  rows,
  state,
}: {
  rows: WorkPhoneRow[];
  state: TableState;
}) {
  const t = useTranslations("workPhones");
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{
    phone: string;
    name: string;
    role: WorkRole;
  } | null>(null);
  const [revoking, setRevoking] = useState<WorkPhoneRow | null>(null);

  const columns: Column<WorkPhoneRow>[] = [
    {
      key: "name",
      header: t("columns.name"),
      sortKey: "name",
      cell: (row) => <span className="font-semibold">{row.name}</span>,
    },
    {
      key: "phone",
      header: t("columns.phone"),
      sortKey: "phone",
      cell: (row) => (
        <span dir="ltr" data-testid="work-phone-number">
          {row.phone}
        </span>
      ),
    },
    {
      key: "role",
      header: t("columns.role"),
      sortKey: "role",
      cell: (row) => <Badge tone="info">{t(`role.${row.role}`)}</Badge>,
    },
    {
      key: "status",
      header: t("columns.status"),
      cell: (row) =>
        row.isActive ? (
          <Badge tone="success">{t("status.active")}</Badge>
        ) : (
          <Badge tone="danger">{t("status.revoked")}</Badge>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">{t("columns.actions")}</span>,
      className: "text-end",
      cell: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            data-testid={`work-phone-change-${row.phone}`}
            onClick={() => {
              setDraft({ phone: row.phone, name: row.name, role: row.role });
              formRef.current?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            {row.isActive ? t("changeRole") : t("reactivate")}
          </Button>
          {row.isActive ? (
            <Button
              size="sm"
              variant="danger"
              data-testid={`work-phone-revoke-${row.phone}`}
              onClick={() => setRevoking(row)}
            >
              {t("revoke")}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div ref={formRef}>
        <RegisterForm
          key={draft ? `${draft.phone}:${draft.role}` : "new"}
          initial={draft}
          onDone={(message) => {
            setDraft(null);
            toast(message);
            router.refresh();
          }}
          onCancel={draft ? () => setDraft(null) : undefined}
        />
      </div>

      <DataTable
        testId="work-phone-table"
        caption={t("title")}
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        state={state}
        emptyLabel={t("empty")}
        toolbar={
          <>
            <TableSearch placeholder={t("search")} />
            <TableFilter
              name="role"
              label={t("filters.role")}
              options={[
                { value: "", label: t("filters.any") },
                ...WORK_ROLES.map((role) => ({
                  value: role,
                  label: t(`role.${role}`),
                })),
              ]}
            />
            <TableFilter
              name="status"
              label={t("filters.status")}
              options={[
                { value: "", label: t("filters.any") },
                { value: "active", label: t("status.active") },
                { value: "revoked", label: t("status.revoked") },
              ]}
            />
          </>
        }
      />

      <ConfirmDialog
        open={revoking !== null}
        title={t("revokeTitle", { name: revoking?.name ?? "" })}
        body={t("revokeBody", { phone: revoking?.phone ?? "" })}
        confirmLabel={t("revoke")}
        onClose={() => setRevoking(null)}
        onConfirm={async (reason) => {
          if (!revoking) return;
          await unwrap(
            browserApi.DELETE("/admin/work-phones/{phone}", {
              params: { path: { phone: revoking.phone }, query: { reason } },
            }),
          );
          toast(t("revoked"));
          router.refresh();
        }}
      />
    </div>
  );
}

function RegisterForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: { phone: string; name: string; role: WorkRole } | null;
  onDone: (message: string) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("workPhones");
  const tCommon = useTranslations("common");
  const form = useApiForm();
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [role, setRole] = useState<WorkRole>(initial?.role ?? "delivery_agent");
  const [reason, setReason] = useState("");

  async function submit() {
    const e164 = toE164(phone);
    if (!isE164(e164)) {
      form.setFieldErrors({ phone: t("phoneInvalid") });
      return;
    }
    const saved = await form.run(() =>
      unwrap(
        browserApi.POST("/admin/work-phones", {
          body: { phone: e164, name: name.trim(), role, reason: reason.trim() },
        }),
      ),
    );
    if (saved) onDone(initial ? t("updated") : t("registered"));
  }

  return (
    <Card>
      <form
        noValidate
        className="flex flex-col gap-4"
        data-testid="work-phone-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <h2 className="text-lg font-bold">
            {initial ? t("changeTitle") : t("registerTitle")}
          </h2>
          <p className="text-sm text-text-muted">{t("registerHint")}</p>
        </div>
        {form.formError === "customerPhone" ? (
          <FormError kind="customerPhone" />
        ) : (
          <FormError kind={form.formError} detail={form.formErrorDetail} />
        )}
        <div className="grid gap-4 md:grid-cols-3">
          <Field
            label={t("fields.phone")}
            hint={t("fields.phoneHint")}
            error={form.fieldErrors.phone}
            name="phone"
          >
            <Input
              dir="ltr"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              readOnly={initial !== null}
              data-testid="input-phone"
              onChange={(event) => {
                setPhone(event.target.value);
                form.clearField("phone");
              }}
            />
          </Field>
          <Field
            label={t("fields.name")}
            hint={t("fields.nameHint")}
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
            label={t("fields.role")}
            error={form.fieldErrors.role}
            name="role"
          >
            <Select
              value={role}
              data-testid="input-role"
              onChange={(event) => setRole(event.target.value as WorkRole)}
            >
              {WORK_ROLES.map((option) => (
                <option key={option} value={option}>
                  {t(`role.${option}`)}
                </option>
              ))}
            </Select>
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
            data-testid="input-reason"
            onChange={(event) => {
              setReason(event.target.value);
              form.clearField("reason");
            }}
          />
        </Field>
        <div className="flex justify-end gap-2">
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel}>
              {tCommon("cancel")}
            </Button>
          ) : null}
          <Button
            type="submit"
            pending={form.pending}
            data-testid="work-phone-submit"
          >
            {initial ? t("saveChange") : t("register")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
