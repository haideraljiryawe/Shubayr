"use client";

import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { api, type Return, type ReturnStatus } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { useOrderDate } from "./order-status";
import { AccountEmpty, AccountError, AccountSkeleton } from "./states";

/** Each return status gets the tone that matches what it means for the shopper. */
const STATUS_TONE: Record<ReturnStatus, BadgeTone> = {
  requested: "warning",
  approved: "info",
  partially_approved: "info",
  completed: "success",
  rejected: "error",
};

/** The customer's return requests, newest first. */
export function ReturnsList() {
  const t = useTranslations("returns");
  const {
    data: returns,
    failed,
    reload,
  } = useResource<Return[]>(() => api.listReturns(), []);

  if (failed) return <AccountError message={t("loadError")} onRetry={reload} />;
  if (!returns) return <AccountSkeleton rows={3} />;

  if (returns.length === 0) {
    return (
      <AccountEmpty
        icon={<RotateCcw className="size-7" aria-hidden />}
        title={t("empty")}
        body={t("emptyBody")}
        action={
          <Link
            href="/account/orders"
            className={buttonClasses({ variant: "cta" })}
          >
            {t("viewOrders")}
          </Link>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3" data-testid="returns-list">
      {returns.map((entry) => (
        <ReturnRow key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

function ReturnRow({ entry }: { entry: Return }) {
  const t = useTranslations("returns");
  const formatDate = useOrderDate();
  const status = (entry.status ?? "requested") as ReturnStatus;
  const itemCount = (entry.items ?? []).reduce(
    (sum, item) => sum + (item.quantity ?? 0),
    0,
  );

  return (
    <li>
      <Card padding="md" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">{t("forOrder")}</span>
              {/* An order number is a Latin-digit run inside Arabic text. */}
              <Link
                href={`/account/orders/${entry.order_id}`}
                dir="ltr"
                className="font-bold text-text [unicode-bidi:isolate] transition-colors hover:text-primary-dark"
              >
                {entry.order_id}
              </Link>
            </p>
            <p className="mt-1 text-xs text-text-muted">
              {t("requestedAt")} {formatDate(entry.created_at)}
            </p>
          </div>

          <Badge tone={STATUS_TONE[status]} data-testid={`return-status-${entry.id}`}>
            {t(`status_${status}`)}
          </Badge>
        </div>

        <p className="text-sm text-text-muted">
          {t("itemCount", { count: itemCount })}
        </p>

        {entry.reason ? (
          <p className="border-t border-border pt-3 text-sm text-text">
            {entry.reason}
          </p>
        ) : null}
      </Card>
    </li>
  );
}
