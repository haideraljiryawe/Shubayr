"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { BellOff, CheckCheck, Radio } from "lucide-react";
import {
  AccountEmpty,
  AccountError,
  AccountSkeleton,
} from "@/components/account/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { useToast } from "@/components/ui/toast";
import { Pager } from "@/components/work/pager";
import { useRouter } from "@/i18n/navigation";
import { api, type InboxNotification, type NotificationPage } from "@/lib/api";
import { cn } from "@/lib/cn";
import { notificationCenter } from "@/lib/notification-center";
import { useStoreDateTime } from "@/lib/store-time";
import { useLatestRequest } from "@/lib/use-latest-request";
import { inboxHref, useNotificationCenter } from "@/lib/use-notifications";

const PER_PAGE = 20;

function newestFirst(a: InboxNotification, b: InboxNotification): number {
  return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
}

/**
 * The notification center: every saved notification, newest first, with an
 * unread filter, per-item and bulk "mark read", and live updates.
 *
 * The page merges the stream into what it fetched. A notification that
 * arrives is added unread (arriving never reads it). A read that happened
 * anywhere — this tab, another tab, the phone — arrives as a read event and
 * flips the matching rows. Replayed history after a reconnect is harmless:
 * a row already on screen is never duplicated, and one older than the
 * newest row shown belongs on another page, so it is left there.
 */
export function InboxView() {
  const t = useTranslations("inbox");
  const locale = useLocale();
  const router = useRouter();
  const showToast = useToast();
  const dateTime = useStoreDateTime();
  const { unread, stream } = useNotificationCenter();

  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const key = `${unreadOnly}:${page}`;
  const fetched = useLatestRequest(key, () =>
    api.listNotifications({ page, per_page: PER_PAGE, unread: unreadOnly }),
  );

  // Live changes layered over the fetched page, reset whenever it reloads.
  const [live, setLive] = useState<{ base: NotificationPage | null; page: NotificationPage | null }>({
    base: null,
    page: null,
  });
  const list = live.base === fetched.data && live.page ? live.page : fetched.data;

  useEffect(
    () =>
      notificationCenter.onEvent((event) => {
        setLive((current) => {
          const base = fetched.data;
          if (!base) return current;
          const shown = current.base === base && current.page ? current.page : base;
          if (event.type === "read") {
            const ids = new Set(event.ids);
            return {
              base,
              page: {
                ...shown,
                data: shown.data.map((item) =>
                  ids.has(item.id) && !item.read_at
                    ? { ...item, read_at: event.read_at }
                    : item,
                ),
              },
            };
          }
          const incoming = event.notification;
          if (shown.data.some((item) => item.id === incoming.id)) return current;
          const newest = shown.data[0];
          const isNewer = !newest || newestFirst(incoming, newest) < 0;
          if (page !== 1 || !isNewer) return current;
          return {
            base,
            page: {
              ...shown,
              total: shown.total + 1,
              data: [incoming, ...shown.data].sort(newestFirst).slice(0, PER_PAGE),
            },
          };
        });
      }),
    [fetched.data, page],
  );

  // A list that failed with the network (offline, a server restart) is
  // fetched again the moment the stream is back, rather than leaving the
  // error card up while live updates flow past it.
  const { failed: listFailed, reload: reloadList } = fetched;
  useEffect(() => {
    if (stream === "open" && listFailed) reloadList();
  }, [stream, listFailed, reloadList]);

  async function markRead(item: InboxNotification) {
    if (item.read_at) return;
    try {
      const result = await api.markNotificationRead(item.id);
      notificationCenter.applyLocalRead([item.id], result.read_at);
    } catch {
      showToast(t("failed"));
    }
  }

  async function markAll() {
    try {
      const result = await api.markAllNotificationsRead();
      notificationCenter.applyLocalRead(
        (list?.data ?? []).filter((item) => !item.read_at).map((item) => item.id),
        result.read_at,
      );
    } catch {
      showToast(t("failed"));
    }
  }

  function open(item: InboxNotification) {
    void markRead(item);
    router.push(inboxHref(item.deep_link));
  }

  const hasUnread = (unread ?? 0) > 0 || Boolean(list?.data.some((item) => !item.read_at));

  return (
    <div className="flex flex-col gap-4" data-testid="inbox" data-stream={stream}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label={t("title")}>
          <Chip
            selected={!unreadOnly}
            onClick={() => {
              setUnreadOnly(false);
              setPage(1);
            }}
            data-testid="inbox-filter-all"
          >
            {t("all")}
          </Chip>
          <Chip
            selected={unreadOnly}
            onClick={() => {
              setUnreadOnly(true);
              setPage(1);
            }}
            data-testid="inbox-filter-unread"
          >
            {t("unread")}
            {unread ? (
              <span className="rounded-full bg-black/5 px-1.5 text-[11px]" data-testid="inbox-unread-count">
                {unread}
              </span>
            ) : null}
          </Chip>
        </div>
        <div className="flex items-center gap-3">
          {stream === "open" ? (
            <span className="inline-flex items-center gap-1 text-xs text-success-dark" data-testid="inbox-live">
              <Radio className="size-3.5" aria-hidden />
              {t("live")}
            </span>
          ) : stream === "reconnecting" ? (
            <span className="text-xs text-text-muted" role="status">
              {t("reconnecting")}
            </span>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasUnread}
            onClick={() => void markAll()}
            data-testid="inbox-mark-all"
            startIcon={<CheckCheck className="size-4" aria-hidden />}
          >
            {t("markAllRead")}
          </Button>
        </div>
      </div>

      {fetched.failed ? (
        <AccountError onRetry={fetched.reload} />
      ) : fetched.loading || !list ? (
        <AccountSkeleton rows={4} />
      ) : list.data.length === 0 ? (
        <AccountEmpty
          icon={<BellOff className="size-7" aria-hidden />}
          title={unreadOnly ? t("emptyUnread") : t("empty")}
          body={unreadOnly ? t("emptyUnreadBody") : t("emptyBody")}
        />
      ) : (
        <>
          <ul className={cn("flex flex-col gap-2", fetched.stale && "opacity-60")} data-testid="inbox-list">
            {list.data.map((item) => {
              const isUnread = !item.read_at;
              return (
                <li key={item.id}>
                  <Card
                    padding="none"
                    data-testid="inbox-item"
                    data-id={item.id}
                    data-read={isUnread ? "false" : "true"}
                    className={cn(
                      "flex items-start gap-3 p-4",
                      isUnread && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-2 size-2.5 shrink-0 rounded-full",
                        isUnread ? "bg-primary" : "bg-transparent",
                      )}
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={() => open(item)}
                      className="flex min-w-0 flex-1 flex-col items-start gap-1 text-start"
                      data-testid="inbox-open"
                    >
                      <span className={cn("text-text", isUnread && "font-bold")}>
                        {locale === "ar" ? item.title_ar : item.title_en}
                        {isUnread ? <span className="sr-only"> — {t("new")}</span> : null}
                      </span>
                      <span className="text-sm text-text-muted">
                        {locale === "ar" ? item.body_ar : item.body_en}
                      </span>
                      {item.type === "quantity_reduction_proposed" ? (
                        // The order page asks for the answer (accept or decline).
                        <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-text" data-testid="inbox-needs-answer">
                          {t("needsAnswer")}
                        </span>
                      ) : item.type === "cancellation_request_approved" || item.type === "cancellation_request_denied" ? (
                        <span className="rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-text" data-testid="inbox-cancellation-decision" data-decision={item.type === "cancellation_request_approved" ? "approved" : "denied"}>
                          {item.type === "cancellation_request_approved" ? t("cancellationApproved") : t("cancellationDenied")}
                        </span>
                      ) : null}
                      <span className="text-xs text-text-muted">{dateTime(item.created_at)}</span>
                    </button>
                    {isUnread ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void markRead(item)}
                        data-testid="inbox-mark-read"
                      >
                        {t("markRead")}
                      </Button>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
          <Pager page={page} perPage={PER_PAGE} total={list.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
