"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CheckCheck } from "lucide-react";
import { Alert, Button } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useStoreDateTime } from "@/components/orders/use-store-date";
import { cn } from "@/lib/cn";
import {
  inbox,
  listNotifications,
  markAllRead,
  markRead,
  mergeEvent,
  useInbox,
  type InboxNotification,
  type NotificationPage,
} from "@/lib/inbox";
import { adminInboxHref } from "@/lib/orders";

/**
 * The staff member's notifications: fetched page by page, then kept live
 * from the stream (arrivals prepended unread, reads from anywhere applied).
 * `compact` is the header dropdown; the full page adds the unread filter and
 * paging.
 */
export function InboxList({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const t = useTranslations("inbox");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const dateTime = useStoreDateTime();
  const { unread } = useInbox();
  const perPage = compact ? 8 : 20;

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<NotificationPage | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const sequence = useRef(0);

  useEffect(() => {
    const ticket = ++sequence.current;
    listNotifications({ page, per_page: perPage, unread: unreadOnly }).then(
      (next) => {
        if (ticket !== sequence.current) return;
        setData(next);
        setFailed(false);
      },
      () => {
        if (ticket === sequence.current) setFailed(true);
      },
    );
  }, [page, perPage, unreadOnly, attempt]);

  useEffect(
    () =>
      inbox.onEvent((event) =>
        setData((current) =>
          current
            ? mergeEvent(current, event, { firstPage: page === 1, perPage })
            : current,
        ),
      ),
    [page, perPage],
  );

  const open = useCallback(
    (item: InboxNotification) => {
      if (!item.read_at) void markRead(item.id).catch(() => toast(t("failed")));
      onNavigate?.();
      router.push(adminInboxHref(item.deep_link));
    },
    [onNavigate, router, t, toast],
  );

  const pages = data ? Math.max(1, Math.ceil(data.total / perPage)) : 1;
  const hasUnread =
    (unread ?? 0) > 0 || Boolean(data?.data.some((item) => !item.read_at));

  return (
    <div
      className="flex flex-col gap-3"
      data-testid={compact ? "inbox-panel" : "inbox"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {compact ? (
          <h2 className="font-bold">{t("title")}</h2>
        ) : (
          <div className="flex gap-2" role="group" aria-label={t("title")}>
            <Button
              size="sm"
              variant={unreadOnly ? "secondary" : "primary"}
              aria-pressed={!unreadOnly}
              onClick={() => {
                setUnreadOnly(false);
                setPage(1);
              }}
              data-testid="inbox-filter-all"
            >
              {t("all")}
            </Button>
            <Button
              size="sm"
              variant={unreadOnly ? "primary" : "secondary"}
              aria-pressed={unreadOnly}
              onClick={() => {
                setUnreadOnly(true);
                setPage(1);
              }}
              data-testid="inbox-filter-unread"
            >
              {t("unread")}
            </Button>
          </div>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={!hasUnread}
          onClick={() =>
            void markAllRead(
              (data?.data ?? [])
                .filter((item) => !item.read_at)
                .map((item) => item.id),
            ).catch(() => toast(t("failed")))
          }
          data-testid="inbox-mark-all"
        >
          <CheckCheck className="size-4" aria-hidden />
          {t("markAllRead")}
        </Button>
      </div>

      {failed ? (
        <Alert>
          {t("loadFailed")}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("retry")}
          </button>
        </Alert>
      ) : !data ? (
        <div className="h-24 animate-pulse rounded-md bg-card" aria-busy />
      ) : data.data.length === 0 ? (
        <p
          className="py-6 text-center text-sm text-text-muted"
          data-testid="inbox-empty"
        >
          {unreadOnly ? t("emptyUnread") : t("empty")}
        </p>
      ) : (
        <ul
          className="flex flex-col divide-y divide-border"
          data-testid="inbox-list"
        >
          {data.data.map((item) => {
            const isUnread = !item.read_at;
            return (
              <li
                key={item.id}
                className={cn(
                  "flex items-start gap-3 py-3",
                  isUnread && "bg-primary/5",
                )}
                data-testid="inbox-item"
                data-id={item.id}
                data-read={isUnread ? "false" : "true"}
              >
                <span
                  className={cn(
                    "mt-2 size-2 shrink-0 rounded-full",
                    isUnread ? "bg-primary" : "bg-transparent",
                  )}
                  aria-hidden
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start"
                  onClick={() => open(item)}
                  data-testid="inbox-open"
                >
                  <span className={cn("text-sm", isUnread && "font-bold")}>
                    {locale === "ar" ? item.title_ar : item.title_en}
                  </span>
                  <span className="text-xs text-text-muted">
                    {locale === "ar" ? item.body_ar : item.body_en}
                  </span>
                  <span className="text-xs text-text-muted">
                    {dateTime(item.created_at)}
                  </span>
                </button>
                {isUnread ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void markRead(item.id).catch(() => toast(t("failed")))
                    }
                    data-testid="inbox-mark-read"
                  >
                    {t("markRead")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {!compact && data && pages > 1 ? (
        <nav
          className="flex items-center justify-between gap-2"
          aria-label={t("pageOf", { page, pages })}
        >
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            {t("previous")}
          </Button>
          <span className="text-sm text-text-muted">
            {t("pageOf", { page, pages })}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t("next")}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
