"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Alert, Badge, Button, Card, Input, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { browserApi, unwrap } from "@/lib/api/client";
import { errorKind, type ErrorKind } from "@/lib/api/errors";
import { categoryNameProblems, expenseRefusal, mappedAccounts, type ExpenseCategory } from "@/lib/expenses";
import { ExpenseRefusalNotice } from "../refusal";
import { Table, THead, TBody, Tr, Th, Td } from "@/components/table/table";

type Failure = { error: unknown; kind: ErrorKind } | null;

export function CategoriesView({ categories, canManage }: { categories: ExpenseCategory[]; canManage: boolean }) {
  const t = useTranslations("expenses.categories");
  const locale = useLocale();
  const accounts = mappedAccounts(categories);
  const name = (category: { name_ar: string; name_en: string }) => (locale === "ar" ? category.name_ar : category.name_en) || category.name_ar;
  const ordered = [...categories].sort((a, b) => Number(b.is_active) - Number(a.is_active) || name(a).localeCompare(name(b), locale));

  return (
    <div className="flex flex-col gap-4">
      {canManage ? <CreateCategory accounts={accounts} /> : <Alert tone="info">{t("readOnly")}</Alert>}
      <Card className="overflow-x-auto">
        <Table data-testid="expense-categories">
          <THead>
            <Tr>
              <Th>{t("columns.name")}</Th>
              <Th>{t("columns.account")}</Th>
              <Th>{t("columns.used")}</Th>
              <Th>{t("columns.status")}</Th>
              {canManage ? <Th /> : null}
            </Tr>
          </THead>
          <TBody>
            {ordered.map((category) => (
              <CategoryRow key={category.id} category={category} canManage={canManage} />
            ))}
          </TBody>
        </Table>
        {!categories.length ? <p className="px-3 py-4 text-body text-text-muted">{t("empty")}</p> : null}
      </Card>
    </div>
  );
}

function CreateCategory({ accounts }: { accounts: Array<ExpenseCategory["ledger_account"]> }) {
  const t = useTranslations("expenses.categories");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [names, setNames] = useState({ ar: "", en: "" });
  const [accountId, setAccountId] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const problems = categoryNameProblems(names);

  async function create() {
    if (pending) return;
    setAttempted(true);
    setFailure(null);
    if (problems.ar || problems.en) return;
    setPending(true);
    try {
      await unwrap(
        browserApi.POST("/admin/expense-categories", {
          body: { name_ar: names.ar.trim(), name_en: names.en.trim(), ...(accountId ? { ledger_account_id: accountId } : {}) },
        }),
      );
      setNames({ ar: "", en: "" });
      setAccountId("");
      setAttempted(false);
      toast(t("created"));
      router.refresh();
    } catch (error) {
      setFailure({ error, kind: errorKind(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="expense-category-create">
      <h2 className="font-bold">{t("createTitle")}</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t("nameAr")} error={attempted && problems.ar ? t(`problems.${problems.ar}`) : null}>
          <Input dir="rtl" maxLength={160} value={names.ar} disabled={pending} onChange={(event) => setNames({ ...names, ar: event.target.value })} data-testid="expense-category-name-ar" />
        </Field>
        <Field label={t("nameEn")} error={attempted && problems.en ? t(`problems.${problems.en}`) : null}>
          <Input dir="ltr" maxLength={160} value={names.en} disabled={pending} onChange={(event) => setNames({ ...names, en: event.target.value })} data-testid="expense-category-name-en" />
        </Field>
        <Field label={t("account")} hint={t("accountHint")}>
          <Select value={accountId} disabled={pending} onValueChange={(value) => setAccountId(value)} data-testid="expense-category-account">
            <option value="">{t("newAccount")}</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.code} · {locale === "ar" ? account.name_ar : account.name_en}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {failure ? (expenseRefusal(failure.error) ? <ExpenseRefusalNotice error={failure.error} /> : <FormError kind={failure.kind} />) : null}
      <div className="flex justify-end">
        <Button pending={pending} onClick={() => void create()} data-testid="expense-category-create-submit">
          {t("create")}
        </Button>
      </div>
    </Card>
  );
}

function CategoryRow({ category, canManage }: { category: ExpenseCategory; canManage: boolean }) {
  const t = useTranslations("expenses.categories");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [names, setNames] = useState({ ar: category.name_ar, en: category.name_en });
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure>(null);
  const problems = categoryNameProblems(names);

  async function patch(body: { name_ar?: string; name_en?: string; is_active?: boolean }, done: string) {
    if (pending) return;
    setFailure(null);
    setPending(true);
    try {
      await unwrap(browserApi.PATCH("/admin/expense-categories/{id}", { params: { path: { id: category.id } }, body }));
      setEditing(false);
      toast(done);
      router.refresh();
    } catch (error) {
      setFailure({ error, kind: errorKind(error) });
    } finally {
      setPending(false);
    }
  }

  return (
    <Tr className="align-top" data-testid="expense-category-row" data-code={category.code} data-active={category.is_active}>
      <Td>
        {editing ? (
          <div className="grid gap-2 md:grid-cols-2">
            <Input dir="rtl" aria-label={t("nameAr")} maxLength={160} value={names.ar} disabled={pending} onChange={(event) => setNames({ ...names, ar: event.target.value })} data-testid="expense-category-edit-ar" />
            <Input dir="ltr" aria-label={t("nameEn")} maxLength={160} value={names.en} disabled={pending} onChange={(event) => setNames({ ...names, en: event.target.value })} data-testid="expense-category-edit-en" />
            {problems.ar || problems.en ? <p className="text-caption text-error-dark md:col-span-2">{t(`problems.${problems.ar ?? problems.en}`)}</p> : null}
          </div>
        ) : (
          <>
            <span className="font-medium" data-testid="expense-category-name">
              {locale === "ar" ? category.name_ar : category.name_en}
            </span>
            <span className="block text-caption text-text-muted">{locale === "ar" ? category.name_en : category.name_ar}</span>
          </>
        )}
        {failure ? (
          <div className="mt-2">{expenseRefusal(failure.error) ? <ExpenseRefusalNotice error={failure.error} /> : <FormError kind={failure.kind} />}</div>
        ) : null}
      </Td>
      <Td data-testid="expense-category-ledger">
        <span dir="ltr" className="font-mono">
          {category.ledger_account.code}
        </span>{" "}
        {locale === "ar" ? category.ledger_account.name_ar : category.ledger_account.name_en}
      </Td>
      <Td dir="ltr">
        {category.expense_count ?? "—"}
      </Td>
      <Td>
        <Badge tone={category.is_active ? "success" : "neutral"}>{category.is_active ? t("active") : t("inactive")}</Badge>
        {category.is_system ? <span className="ms-2 text-caption text-text-muted">{t("system")}</span> : null}
      </Td>
      {canManage ? (
        <Td>
          <div className="flex flex-wrap justify-end gap-2">
            {editing ? (
              <>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setEditing(false); setNames({ ar: category.name_ar, en: category.name_en }); }}>
                  {t("cancel")}
                </Button>
                <Button
                  size="sm"
                  pending={pending}
                  disabled={Boolean(problems.ar || problems.en)}
                  onClick={() => void patch({ name_ar: names.ar.trim(), name_en: names.en.trim() }, t("renamed"))}
                  data-testid="expense-category-save"
                >
                  {t("save")}
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)} data-testid="expense-category-rename">
                  {t("rename")}
                </Button>
                <Button
                  size="sm"
                  variant={category.is_active ? "ghost" : "secondary"}
                  pending={pending}
                  onClick={() => void patch({ is_active: !category.is_active }, category.is_active ? t("deactivated") : t("activated"))}
                  data-testid={category.is_active ? "expense-category-deactivate" : "expense-category-activate"}
                >
                  {category.is_active ? t("deactivate") : t("activate")}
                </Button>
              </>
            )}
          </div>
        </Td>
      ) : null}
    </Tr>
  );
}
