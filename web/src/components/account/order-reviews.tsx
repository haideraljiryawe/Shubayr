"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2, Star, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { StarInput } from "@/components/ui/star-input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { api, type Order, type OrderItem } from "@/lib/api";
import { useResource } from "@/lib/use-resource";
import { OrderItemLine } from "./order-item-line";

/**
 * Reviewing a delivered order: one review per product, plus one rating for the
 * delivery itself.
 *
 * The two are deliberately separate acts on separate endpoints — a shopper can
 * love the product and not the courier — so they never share a form or a
 * submit. Both only appear once the order is delivered; the caller gates that.
 */
export function OrderReviews({
  order,
  deliveryId,
}: {
  order: Order;
  /** Null when the order has no delivery to rate. */
  deliveryId: string | null;
}) {
  const t = useTranslations("reviews");
  const orderId = order.id ?? "";

  // Which items already carry a review by this customer. See the CONTRACT GAP
  // note on api.listReviewedOrderItems: nothing in the contract reports this.
  const { data: reviewed, reload } = useResource<string[]>(
    () => api.listReviewedOrderItems(orderId).catch(() => []),
    [orderId],
  );

  const done = new Set(reviewed ?? []);
  const items = order.items ?? [];
  const pending = items.filter((item) => !done.has(item.id ?? ""));

  return (
    <>
      <Card padding="md" className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-text">{t("productTitle")}</h2>
          <p className="mt-1 text-sm text-text-muted">{t("productIntro")}</p>
        </div>

        {pending.length === 0 ? (
          <p
            data-testid="reviews-all-done"
            className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2.5 text-sm font-medium text-success-dark"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {t("allReviewed")}
          </p>
        ) : null}

        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="py-3">
              <ProductReviewRow
                item={item}
                reviewed={done.has(item.id ?? "")}
                onSubmitted={reload}
              />
            </li>
          ))}
        </ul>
      </Card>

      {deliveryId ? (
        <DeliveryRatingCard deliveryId={deliveryId} />
      ) : null}
    </>
  );
}

function ProductReviewRow({
  item,
  reviewed,
  onSubmitted,
}: {
  item: OrderItem;
  reviewed: boolean;
  onSubmitted: () => void;
}) {
  const t = useTranslations("reviews");
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const id = item.id ?? "";

  const submit = useCallback(async () => {
    if (stars < 1) {
      setError(t("errStars"));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await api.createReview(item.product_id ?? "", {
        order_item_id: id,
        rating: stars,
        comment: comment.trim() || undefined,
      });
      showToast(t("submitted"));
      setOpen(false);
      onSubmitted();
    } catch {
      setError(t("errFailed"));
    } finally {
      setSaving(false);
    }
  }, [comment, id, item.product_id, onSubmitted, showToast, stars, t]);

  return (
    <OrderItemLine item={item}>
      {reviewed ? (
        <Badge tone="success" data-testid={`review-done-${id}`}>
          {t("reviewed")}
        </Badge>
      ) : open ? (
        <form
          noValidate
          data-testid={`review-form-${id}`}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-1 flex flex-col gap-3"
        >
          <Field label={t("stars")} error={error}>
            <StarInput
              value={stars}
              onValueChange={(next) => {
                setStars(next);
                setError(undefined);
              }}
              label={t("stars")}
              starLabel={(count) => t("starsLabel", { count })}
              error={error}
              name={`review-stars-${id}`}
            />
          </Field>

          <Field label={t("comment")} htmlFor={`review-comment-${id}`}>
            <Textarea
              id={`review-comment-${id}`}
              rows={3}
              value={comment}
              placeholder={t("commentPlaceholder")}
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>

          <p className="text-xs text-text-muted">{t("pending")}</p>

          <span className="flex gap-2">
            <Button
              type="submit"
              variant="cta"
              size="sm"
              disabled={saving}
              data-testid={`review-submit-${id}`}
              startIcon={
                saving ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null
              }
            >
              {saving ? t("submitting") : t("submit")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              {t("cancel")}
            </Button>
          </span>
        </form>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          data-testid={`review-open-${id}`}
          onClick={() => setOpen(true)}
          startIcon={<Star className="size-4" aria-hidden />}
          className="self-start"
        >
          {t("rate")}
        </Button>
      )}
    </OrderItemLine>
  );
}

function DeliveryRatingCard({ deliveryId }: { deliveryId: string }) {
  const t = useTranslations("reviews");
  const showToast = useToast();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [rated, setRated] = useState(false);

  const submit = async () => {
    if (stars < 1) {
      setError(t("errStars"));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await api.rateDelivery(deliveryId, {
        stars,
        comment: comment.trim() || undefined,
      });
      showToast(t("deliveryRated"));
      setRated(true);
    } catch {
      setError(t("errFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card padding="md" className="flex flex-col gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-bold text-text">
          <Truck className="size-5 shrink-0 text-primary-dark" aria-hidden />
          {t("deliveryTitle")}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{t("deliveryIntro")}</p>
      </div>

      {rated ? (
        <p
          data-testid="delivery-rated"
          className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2.5 text-sm font-medium text-success-dark"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {t("deliveryRated")}
        </p>
      ) : (
        <form
          noValidate
          data-testid="delivery-rating-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-3"
        >
          <Field label={t("stars")} error={error}>
            <StarInput
              value={stars}
              onValueChange={(next) => {
                setStars(next);
                setError(undefined);
              }}
              label={t("deliveryTitle")}
              starLabel={(count) => t("starsLabel", { count })}
              error={error}
              name="delivery-stars"
            />
          </Field>

          <Field label={t("comment")} htmlFor="delivery-comment">
            <Textarea
              id="delivery-comment"
              rows={3}
              value={comment}
              placeholder={t("commentPlaceholder")}
              onChange={(event) => setComment(event.target.value)}
            />
          </Field>

          <Button
            type="submit"
            variant="cta"
            size="sm"
            disabled={saving}
            data-testid="delivery-rating-submit"
            className="self-start"
            startIcon={
              saving ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null
            }
          >
            {saving ? t("submitting") : t("submit")}
          </Button>
        </form>
      )}
    </Card>
  );
}
