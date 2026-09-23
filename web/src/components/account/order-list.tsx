"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronLeft, Package } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Price } from "@/components/ui/price";
import { Link } from "@/i18n/navigation";
import { api, type Order } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { AccountEmpty, AccountError, AccountSkeleton } from "./states";
import { OrderStatusChip, useOrderDate } from "./order-status";

/** «طلباتي» — GET /orders, newest first. */
export function OrderList() {
  const t = useTranslations("orders");
  const { data: orders, failed, reload } = useResource(() => api.listOrders(), []);

  if (failed) return <AccountError onRetry={reload} />;
  if (!orders) return <AccountSkeleton />;

  if (orders.length === 0) {
    return (
      <AccountEmpty
        icon={<Package className="size-7" aria-hidden />}
        title={t("empty")}
        body={t("emptyBody")}
        action={
          <Link href="/categories" className={buttonClasses({ variant: "cta" })}>
            {t("browse")}
          </Link>
        }
      />
    );
  }

  return <OrderRows orders={orders} />;
}

/**
 * The row thumbnails come from the order itself: the contract snapshots
 * `image_url` onto each order item at placement, so the list no longer fans out
 * a product request per row and cannot show artwork the order never had.
 */
function OrderRows({ orders }: { orders: Order[] }) {
  return (
    <ul className="flex flex-col gap-3" data-testid="order-list">
      {orders.map((order) => (
        <li key={order.id}>
          <OrderRow
            order={order}
            thumbnail={order.items?.[0]?.image_url ?? null}
          />
        </li>
      ))}
    </ul>
  );
}

function OrderRow({
  order,
  thumbnail,
}: {
  order: Order;
  thumbnail: string | null;
}) {
  const t = useTranslations("orders");
  const formatDate = useOrderDate();

  const items = order.items ?? [];
  const units = items.reduce((sum, item) => sum + (item.quantity ?? 0), 0);

  return (
    <Card padding="none" interactive className="overflow-hidden">
      <Link
        href={`/account/orders/${order.id}`}
        data-testid="order-row"
        className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4"
      >
        <span className="relative size-16 shrink-0 overflow-hidden rounded-md bg-card">
          {thumbnail ? (
            <Image
              src={thumbnail}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center">
              <Package className="size-7 text-border" aria-hidden />
            </span>
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            {/* An order number is a Latin identifier inside an RTL line. */}
            <span
              dir="ltr"
              className="font-bold text-text [unicode-bidi:isolate]"
              data-testid="order-number"
            >
              {order.order_number}
            </span>
            {order.status ? <OrderStatusChip status={order.status} /> : null}
          </span>

          <span className="text-xs text-text-muted">
            {formatDate(order.placed_at)} · {t("itemCount", { count: units })}
          </span>

          <Price amount={order.total ?? 0} size="sm" />
        </span>

        <ChevronLeft
          className="size-5 shrink-0 text-text-muted rtl-flip"
          aria-hidden
        />
      </Link>
    </Card>
  );
}
