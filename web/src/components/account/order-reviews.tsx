"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  Loader2,
  Pencil,
  Star,
  Trash2,
  Truck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { StarInput } from "@/components/ui/star-input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  ApiError,
  api,
  type Order,
  type OrderItem,
  type Review,
} from "@/lib/api";
import { OrderItemLine } from "./order-item-line";

/**
 * Reviews this session has written or resolved, keyed by order item.
 *
 * It lives outside the component because the order refetches after every
 * write, and while that is in flight the page shows a skeleton — which
 * unmounts these rows and would otherwise throw away the only handle we have
 * on a freshly created review. See the CONTRACT GAP note below: there is no
 * route that would let us look it up again.
 */
const knownReviews = new Map<string, Review>();

/**
 * Reviewing a delivered order: one review per purchased line, plus one rating
 * for the delivery itself.
 *
 * The two are deliberately separate acts on separate endpoints — a shopper can
 * love the product and not the courier — so they never share a form or a
 * submit. Both only appear once the order is delivered; the caller gates that.
 *
 * WHICH lines are already reviewed comes from `OrderItem.reviewed`, a
 * per-caller flag the order itself carries, so there is nothing extra to
 * fetch and no second source of truth to drift.
 *
 * CONTRACT GAP: editing or deleting a review needs its id, and a customer has
 * no route to their own. GET /products/{id}/reviews is public and returns only
 * PUBLISHED rows, so a review still awaiting moderation is invisible to the
 * person who wrote it the moment they reload the page. This component
 * therefore offers edit and delete whenever it can identify the review — it
 * just created it, or it is published and findable — and says plainly that a
 * pending one cannot be changed yet. A customer-scoped GET /me/reviews would
 * close this.
 */
export function OrderReviews({
  order,
  deliveryId,
  onChanged,
}: {
  order: Order;
  /** Null when the order has no delivery to rate. */
  deliveryId: string | null;
  /** Refetch the order, so `reviewed` flags reflect what just happened. */
  onChanged: () => void;
}) {
  const t = useTranslations("reviews");
  const items = order.items ?? [];
  const outstanding = items.filter((item) => !item.reviewed);

  return (
    <>
      <Card padding="md" className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-bold text-text">{t("productTitle")}</h2>
          <p className="mt-1 text-sm text-text-muted">{t("productIntro")}</p>
        </div>

        {outstanding.length === 0 ? (
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
              <ProductReviewRow item={item} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      </Card>

      {deliveryId ? <DeliveryRatingCard deliveryId={deliveryId} /> : null}
    </>
  );
}

function ProductReviewRow({
  item,
  onChanged,
}: {
  item: OrderItem;
  onChanged: () => void;
}) {
  const t = useTranslations("reviews");
  const showToast = useToast();
  const id = item.id ?? "";
  const productId = item.product_id ?? "";

  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  /** The caller's own review, once this component can identify it. */
  const [mine, setMineState] = useState<Review | null>(
    () => knownReviews.get(id) ?? null,
  );

  const setMine = useCallback(
    (review: Review | null) => {
      if (review) knownReviews.set(id, review);
      else knownReviews.delete(id);
      setMineState(review);
    },
    [id],
  );
  // Hoisted out of the dependency arrays below: optional chaining inside a
  // dep list defeats the compiler's memoization checks.
  const reviewId = mine?.id ?? null;

  // A published review is findable on the product; a pending one is not. This
  // is what decides whether edit and delete can be offered after a reload, so
  // it runs once per reviewed line and quietly gives up when it cannot.
  useEffect(() => {
    if (!item.reviewed || mine || !productId) return;
    let cancelled = false;

    api
      .listReviews(productId, { per_page: 100 })
      .then((page) => {
        if (cancelled) return;
        const found = (page.data ?? []).find(
          (review) => review.order_item_id === id,
        );
        if (found) setMine(found);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [id, item.reviewed, mine, productId, setMine]);

  const startEdit = useCallback(() => {
    setStars(mine?.rating ?? 0);
    setComment(mine?.comment ?? "");
    setError(undefined);
    setOpen(true);
  }, [mine]);

  const submit = useCallback(async () => {
    if (stars < 1) {
      setError(t("errStars"));
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      if (reviewId) {
        // Editing content sends the review back to moderation, which the note
        // under the form warns about before the shopper presses save.
        const updated = await api.updateReview(reviewId, {
          rating: stars,
          comment: comment.trim() || null,
        });
        setMine(updated);
        showToast(t("updated"));
      } else {
        const created = await api.createReview(productId, {
          order_item_id: id,
          rating: stars,
          comment: comment.trim() || undefined,
        });
        // Holding the created review is what makes edit and delete reachable
        // in this session, before any moderator has looked at it.
        setMine(created);
        showToast(t("submitted"));
      }
      setOpen(false);
      onChanged();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? t("errAlready")
          : t("errFailed"),
      );
    } finally {
      setSaving(false);
    }
  }, [comment, id, onChanged, productId, reviewId, setMine, showToast, stars, t]);

  const remove = useCallback(async () => {
    if (!reviewId) return;
    setSaving(true);
    setError(undefined);
    try {
      await api.deleteReview(reviewId);
      setMine(null);
      setOpen(false);
      setStars(0);
      setComment("");
      showToast(t("deleted"));
      onChanged();
    } catch {
      setError(t("errFailed"));
    } finally {
      setSaving(false);
    }
  }, [onChanged, reviewId, setMine, showToast, t]);

  if (open) {
    return (
      <OrderItemLine item={item}>
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

          <p className="text-xs text-text-muted">
            {mine ? t("editResetsToPending") : t("pending")}
          </p>

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
      </OrderItemLine>
    );
  }

  return (
    <OrderItemLine item={item}>
      {item.reviewed ? (
        <span className="flex flex-col gap-2">
          <span className="flex flex-wrap items-center gap-2">
            <Badge
              tone={mine?.status === "published" ? "success" : "warning"}
              data-testid={`review-done-${id}`}
            >
              {mine?.status === "published" ? t("published") : t("reviewed")}
            </Badge>

            {mine ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid={`review-edit-${id}`}
                  onClick={startEdit}
                  startIcon={<Pencil className="size-4" aria-hidden />}
                >
                  {t("edit")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  data-testid={`review-delete-${id}`}
                  onClick={() => void remove()}
                  startIcon={<Trash2 className="size-4" aria-hidden />}
                  className="text-error-dark"
                >
                  {t("delete")}
                </Button>
              </>
            ) : (
              // Written, but awaiting moderation and so not findable — see the
              // CONTRACT GAP note at the top of this file.
              <span
                data-testid={`review-locked-${id}`}
                className="text-xs text-text-muted"
              >
                {t("pendingNotEditable")}
              </span>
            )}
          </span>

          {error ? (
            <span role="alert" className="text-sm font-medium text-error">
              {error}
            </span>
          ) : null}
        </span>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          data-testid={`review-open-${id}`}
          onClick={() => {
            setStars(0);
            setComment("");
            setError(undefined);
            setOpen(true);
          }}
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
    } catch (cause) {
      // The contract allows one rating per delivery, so a repeat is a 409 and
      // reads as "already done" rather than as a failure.
      if (cause instanceof ApiError && cause.status === 409) {
        setRated(true);
        return;
      }
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
