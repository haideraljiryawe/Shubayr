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
 * The caller's own reviews, keyed by order item.
 *
 * It lives outside the component because the order refetches after every
 * write, and while that is in flight the page shows a skeleton — which
 * unmounts these rows. Keeping what is already known means they come back
 * with their status and controls in place instead of flickering while
 * GET /me/reviews is asked again.
 */
const knownReviews = new Map<string, Review>();

/** GET /me/reviews pages to walk before giving up on a very old order. */
const MAX_REVIEW_PAGES = 10;

/**
 * Find the caller's reviews of these order items.
 *
 * GET /me/reviews is newest first, so a recent order is answered by the first
 * page; an older one walks on until every reviewed line is accounted for.
 */
async function findMyReviews(
  orderItemIds: string[],
): Promise<Map<string, Review>> {
  const wanted = new Set(orderItemIds);
  const found = new Map<string, Review>();
  for (let page = 1; page <= MAX_REVIEW_PAGES; page += 1) {
    const result = await api.listMyReviews({ page, per_page: 100 });
    for (const review of result.data) {
      const itemId = review.order_item_id ?? "";
      if (wanted.has(itemId)) found.set(itemId, review);
    }
    const exhausted =
      result.data.length === 0 || page * result.per_page >= result.total;
    if (found.size === wanted.size || exhausted) break;
  }
  return found;
}

type Lookup = "loading" | "done" | "failed";

/**
 * Reviewing a delivered order: one review per purchased line, plus one rating
 * for the delivery itself.
 *
 * The two are deliberately separate acts on separate endpoints — a shopper can
 * love the product and not the courier — so they never share a form or a
 * submit. Both only appear once the order is delivered; the caller gates that.
 *
 * WHICH lines are already reviewed comes from `OrderItem.reviewed`, a
 * per-caller flag the order itself carries. The reviews themselves — their
 * id, their text and their moderation status — come from GET /me/reviews,
 * the customer-scoped list that includes pending and rejected rows. The public
 * product list is published-only and could never find a review still waiting
 * on a moderator; this can, which is what keeps edit and delete available
 * after a reload whatever state the review is in.
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

  // Only lines the order marks reviewed have a review to find. Joined into a
  // string so the lookup re-runs when that set changes, not on every render.
  const reviewedKey = items
    .filter((item) => item.reviewed && item.id)
    .map((item) => item.id ?? "")
    .join(",");

  const [mine, setMineMap] = useState<Map<string, Review>>(() => {
    const known = new Map<string, Review>();
    for (const item of items) {
      const review = knownReviews.get(item.id ?? "");
      if (review) known.set(item.id ?? "", review);
    }
    return known;
  });
  const [lookup, setLookup] = useState<Lookup>(
    reviewedKey ? "loading" : "done",
  );
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!reviewedKey) return;
    let cancelled = false;

    findMyReviews(reviewedKey.split(",")).then(
      (found) => {
        if (cancelled) return;
        for (const [itemId, review] of found) knownReviews.set(itemId, review);
        setMineMap((current) => new Map([...current, ...found]));
        setLookup("done");
      },
      () => {
        if (!cancelled) setLookup("failed");
      },
    );

    return () => {
      cancelled = true;
    };
  }, [reviewedKey, attempt]);

  const setMine = useCallback((itemId: string, review: Review | null) => {
    if (review) knownReviews.set(itemId, review);
    else knownReviews.delete(itemId);
    setMineMap((current) => {
      const next = new Map(current);
      if (review) next.set(itemId, review);
      else next.delete(itemId);
      return next;
    });
  }, []);

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

        {lookup === "failed" ? (
          <p
            role="alert"
            className="flex flex-wrap items-center gap-2 text-sm text-error-dark"
          >
            {t("mineLoadError")}
            <Button
              variant="ghost"
              size="sm"
              data-testid="reviews-mine-retry"
              onClick={() => {
                setLookup("loading");
                setAttempt((count) => count + 1);
              }}
            >
              {t("retry")}
            </Button>
          </p>
        ) : null}

        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="py-3">
              <ProductReviewRow
                item={item}
                mine={mine.get(item.id ?? "") ?? null}
                looking={lookup === "loading"}
                onMine={setMine}
                onChanged={onChanged}
              />
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
  mine,
  looking,
  onMine,
  onChanged,
}: {
  item: OrderItem;
  /** The caller's own review of this line, once GET /me/reviews found it. */
  mine: Review | null;
  /** True while that lookup is still in flight. */
  looking: boolean;
  onMine: (itemId: string, review: Review | null) => void;
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

  const setMine = useCallback(
    (review: Review | null) => onMine(id, review),
    [id, onMine],
  );
  // Hoisted out of the dependency arrays below: optional chaining inside a
  // dep list defeats the compiler's memoization checks.
  const reviewId = mine?.id ?? null;

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
        // Held straight away so edit and delete are offered at once; after a
        // reload GET /me/reviews finds it again, pending or not.
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
            <ReviewStatusBadge status={mine?.status} testId={`review-done-${id}`} />

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
            ) : looking ? (
              <Loader2
                role="status"
                className="size-4 animate-spin text-text-muted"
                aria-label={t("mineLoading")}
              />
            ) : null}
          </span>

          {mine ? <MyReviewSummary review={mine} itemId={id} /> : null}

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

const STATUS_TONE = {
  pending: "warning",
  published: "success",
  rejected: "error",
} as const;

const STATUS_LABEL = {
  pending: "statusPending",
  published: "statusPublished",
  rejected: "statusRejected",
} as const;

/**
 * Where the review stands with moderation. Until GET /me/reviews answers, the
 * line is only known to be reviewed, and the badge says just that.
 */
function ReviewStatusBadge({
  status,
  testId,
}: {
  status: Review["status"];
  testId: string;
}) {
  const t = useTranslations("reviews");

  return (
    <Badge
      tone={status ? STATUS_TONE[status] : "neutral"}
      data-testid={testId}
      data-status={status ?? "unknown"}
    >
      {status ? t(STATUS_LABEL[status]) : t("reviewed")}
    </Badge>
  );
}

/** The shopper's own words back to them, and why a moderator refused them. */
function MyReviewSummary({ review, itemId }: { review: Review; itemId: string }) {
  const t = useTranslations("reviews");

  return (
    <span
      data-testid={`review-mine-${itemId}`}
      className="flex flex-col gap-1 text-sm text-text-muted"
    >
      <span className="flex items-center gap-1.5">
        <Star className="size-4 fill-warning text-warning" aria-hidden />
        {t("starsLabel", { count: review.rating ?? 0 })}
      </span>
      {review.comment ? (
        <span className="line-clamp-2 text-text">{review.comment}</span>
      ) : null}
      {review.status === "pending" ? (
        <span className="text-xs">{t("pending")}</span>
      ) : null}
      {review.status === "rejected" ? (
        <span
          data-testid={`review-rejected-${itemId}`}
          className="text-xs text-error-dark"
        >
          {review.moderation_reason
            ? `${t("rejectedReason", { reason: review.moderation_reason })} `
            : null}
          {t("rejectedHint")}
        </span>
      ) : null}
    </span>
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
