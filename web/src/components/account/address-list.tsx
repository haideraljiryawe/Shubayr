"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MapPin, Plus, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { api, type Address } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { AccountEmpty, AccountError, AccountSkeleton } from "./states";
import {
  AddressEditor,
  EMPTY_ADDRESS,
  toAddressInput,
  valuesFromAddress,
  type AddressValues,
} from "./address-editor";

/** «عناويني» — the saved addresses the checkout picks from. */
export function AddressList() {
  const t = useTranslations("addresses");
  const showToast = useToast();

  const {
    data: addresses,
    failed,
    reload,
  } = useResource(() => api.listAddresses(), []);

  /** null = not editing; "new" = the add form; otherwise the address id. */
  const [editing, setEditing] = useState<string | null>(null);
  const [values, setValues] = useState<AddressValues>(EMPTY_ADDRESS);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const startAdd = () => {
    setEditing("new");
    setValues(EMPTY_ADDRESS);
    setFormError(null);
  };

  const startEdit = (address: Address) => {
    setEditing(address.id ?? null);
    setValues(valuesFromAddress(address));
    setFormError(null);
  };

  async function save() {
    setSaving(true);
    setFormError(null);
    try {
      const input = toAddressInput(values);
      if (editing === "new") {
        await api.createAddress(input);
        showToast(t("saved"));
      } else if (editing) {
        await api.updateAddress(editing, input);
        showToast(t("updated"));
      }
      setEditing(null);
      reload();
    } catch {
      setFormError(t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    try {
      await api.deleteAddress(id);
      setConfirmingDelete(null);
      showToast(t("removed"));
      reload();
    } catch {
      showToast(t("deleteFailed"));
    }
  }

  async function makeDefault(address: Address) {
    if (!address.id) return;
    try {
      await api.updateAddress(address.id, {
        ...toAddressInput(valuesFromAddress(address)),
        is_default: true,
      });
      showToast(t("defaultSet"));
      reload();
    } catch {
      showToast(t("saveFailed"));
    }
  }

  if (failed) return <AccountError onRetry={reload} />;
  if (!addresses) return <AccountSkeleton />;

  return (
    <div className="flex flex-col gap-4">
      {editing ? (
        <AddressEditor
          title={editing === "new" ? t("addTitle") : t("editTitle")}
          values={values}
          onChange={setValues}
          onSubmit={save}
          onCancel={() => setEditing(null)}
          saving={saving}
          error={formError}
        />
      ) : (
        <Button
          variant="cta"
          onClick={startAdd}
          data-testid="address-add"
          startIcon={<Plus className="size-4" aria-hidden />}
          className="self-start"
        >
          {t("add")}
        </Button>
      )}

      {addresses.length === 0 && !editing ? (
        <AccountEmpty
          icon={<MapPin className="size-7" aria-hidden />}
          title={t("empty")}
          body={t("emptyBody")}
        />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="address-list">
          {addresses.map((address) => (
            <li key={address.id}>
              <Card padding="md" className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-2">
                    <MapPin
                      className="mt-0.5 size-4 shrink-0 text-primary-dark"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-text">
                          {address.label}
                        </span>
                        {address.is_default ? (
                          <Badge tone="success" data-testid="address-default-badge">
                            {t("default")}
                          </Badge>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        {[address.city, address.area, address.street]
                          .filter(Boolean)
                          .join(" — ")}
                      </p>
                      {address.details ? (
                        <p className="mt-0.5 text-sm text-text-muted">
                          {address.details}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>

                {confirmingDelete === address.id ? (
                  <div
                    role="alertdialog"
                    aria-label={t("deleteConfirm")}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-error/40 bg-error/8 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-error-dark">
                      {t("deleteConfirm")}
                    </span>
                    <div className="ms-auto flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmingDelete(null)}
                      >
                        {t("cancel")}
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        data-testid="address-delete-confirm"
                        onClick={() => address.id && void remove(address.id)}
                      >
                        {t("deleteYes")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      data-testid="address-edit"
                      onClick={() => startEdit(address)}
                    >
                      {t("edit")}
                    </Button>
                    {!address.is_default ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid="address-set-default"
                        onClick={() => void makeDefault(address)}
                        startIcon={<Star className="size-4" aria-hidden />}
                      >
                        {t("setDefault")}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      data-testid="address-delete"
                      onClick={() => setConfirmingDelete(address.id ?? null)}
                      startIcon={<Trash2 className="size-4" aria-hidden />}
                      className="text-error-dark"
                    >
                      {t("delete")}
                    </Button>
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
