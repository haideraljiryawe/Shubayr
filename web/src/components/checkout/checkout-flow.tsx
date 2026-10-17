"use client";

import { useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ShoppingCart } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import {
  ApiError,
  api,
  type Address,
  type Governorate,
  type Order,
  type OrderItem,
} from "@/lib/api";
import {
  deliveryProblem,
  governorateName,
  isAddressRefusal,
  type DeliveryProblem,
} from "@/lib/delivery";
import type { CartTotals } from "@/lib/cart";
import { cartStore } from "@/lib/cart-store";
import { deliveryLocation, useDeliveryLocation } from "@/lib/delivery-location";
import { useCart, type CartViewLine } from "@/lib/use-cart";
import { useDeliveryPricing } from "@/lib/use-pricing";
import {
  acceptedPriceVersions,
  priceChanges,
  type PriceChange,
} from "@/lib/order-lifecycle";
import { useResource } from "@/lib/use-resource";
import {
  AddressForm,
  EMPTY_DELIVERY,
  toAddressCreate,
  type DeliveryDetails,
} from "./address-form";
import { AuthGate } from "./auth-gate";
import { Confirmation } from "./confirmation";
import { PaymentMethod } from "./payment-method";
import { PriceChangeDialog } from "./price-change-dialog";
import { useTheme } from "@/components/providers/theme-provider";
import { ReviewStep, type ChosenAddress } from "./review-step";
import { SavedAddresses } from "./saved-addresses";
import { CheckoutSteps, type CheckoutStepKey } from "./steps";

/**
 * Address → (sign-in, when needed) → Review → Confirmation.
 *
 * Two address paths meet here. A signed-in customer picks from the addresses on
 * their account, which is one tap and no typing; a guest fills the form, and
 * that address is created on their account at the moment they sign in to place
 * the order. The sign-in step itself only appears while signed out, because the
 * contract requires an authenticated customer for POST /orders.
 */
type Stage = "address" | "auth" | "review" | "done";

const STAGE_STEP: Record<Stage, CheckoutStepKey> = {
  address: "address",
  auth: "review",
  review: "review",
  done: "done",
};

/** What the confirmation screen shows after the cart has been emptied. */
interface PlacedOrder {
  order: Order;
  lines: CartViewLine[];
  /** The totals as shown at review, which is what the server charged. */
  totals: CartTotals;
  couponCode: string | null;
}

function summariseSaved(
  address: Address,
  governorate: string | null,
): ChosenAddress {
  return {
    id: address.id ?? null,
    title: address.label ?? "",
    phone: null,
    governorate,
    lines: [
      [address.city, address.area, address.street].filter(Boolean).join(" — "),
      address.details ?? "",
    ].filter(Boolean),
  };
}

function summariseTyped(
  delivery: DeliveryDetails,
  governorate: string | null,
): ChosenAddress {
  return {
    id: null,
    title: delivery.name,
    phone: delivery.phone,
    governorate,
    lines: [
      [delivery.city, delivery.area, delivery.street]
        .filter(Boolean)
        .join(" — "),
      delivery.details,
    ].filter(Boolean),
  };
}

export function CheckoutFlow() {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const locale = useLocale();
  const showToast = useToast();
  const router = useRouter();
  const { currency } = useTheme();
  const view = useCart();
  const { lines, hydrated, couponCode } = view;
  const { isAuthenticated, user } = useAuth();
  // The delivery location chosen in the cart, if any: the starting point here.
  const remembered = useDeliveryLocation();

  const [stage, setStage] = useState<Stage>("address");
  const [delivery, setDelivery] = useState<DeliveryDetails>(EMPTY_DELIVERY);
  /** The saved address the customer picked, if they picked one. */
  const [chosenId, setChosenId] = useState<string | null>(null);
  /** True once they choose to type a new address instead of picking. */
  const [typingNew, setTypingNew] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The API refused the address at checkout (no governorate, or not served). */
  const [addressNotice, setAddressNotice] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  /**
   * One key per checkout attempt, minted when the flow mounts.
   *
   * Replaying it on a retry is what makes a double-submit — or a response lost
   * on a flaky connection — return the original order instead of placing a
   * second one. It only changes once an order actually lands, so every retry
   * of *this* basket carries the same key.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    globalThis.crypto.randomUUID(),
  );
  /**
   * API 10.0: prices that changed since the cart (409 PRICE_CHANGED), shown
   * for acceptance. Nothing is ordered until the shopper accepts.
   */
  const [priceChange, setPriceChange] = useState<PriceChange[] | null>(null);
  const [priceChangeError, setPriceChangeError] = useState<string | null>(null);
  /** An address typed and saved during this attempt, reused by a resubmission. */
  const createdAddressId = useRef<string | null>(null);

  // Saved addresses belong to a signed-in customer; a guest has none to read.
  const savedAddresses = useResource<Address[]>(
    () => (isAuthenticated ? api.listAddresses() : Promise.resolve([])),
    [isAuthenticated],
  );
  const addressBook = savedAddresses.data ?? [];
  // The governorates the store lists, with whether a zone serves each one.
  const governorateList = useResource<Governorate[]>(
    () => api.listGovernorates(),
    [],
  );
  const governorates = new Map(
    (governorateList.data ?? []).map((item) => [item.id, item]),
  );
  const nameOf = (id: string | null | undefined) => {
    const governorate = id ? governorates.get(id) : undefined;
    return governorate ? governorateName(governorate, locale) : null;
  };
  /** The message for an address that cannot be delivered to, or null. */
  const problemText = (
    problem: DeliveryProblem | null,
    governorateId: string | null | undefined,
  ) =>
    problem === "missingGovernorate"
      ? t("delivery.missingGovernorate")
      : problem === "unserved"
        ? nameOf(governorateId)
          ? t("delivery.unserved", { name: nameOf(governorateId)! })
          : t("delivery.unservedUnknown")
        : null;

  // Derived, not stored: the explicit pick, else the account default, else the
  // first one. No effect has to reconcile a selection with a list that arrives
  // later.
  const saved =
    addressBook.find(
      (item) => item.id === (chosenId ?? remembered.addressId),
    ) ??
    addressBook.find((item) => item.is_default) ??
    addressBook[0] ??
    null;

  // A signed-in shopper's own name and number are the delivery contact, so the
  // "new address" form starts filled in rather than blank — and its
  // governorate is the one chosen in the cart, if any.
  const deliveryValues: DeliveryDetails = {
    ...delivery,
    name: delivery.name || (user?.name ?? ""),
    phone: delivery.phone || (user?.phone ?? ""),
    governorate_id: delivery.governorate_id || (remembered.governorateId ?? ""),
  };

  const pickingSaved = isAuthenticated && !typingNew && addressBook.length > 0;
  // Until the governorates are in, nothing is judged (a slow list is not "unserved").
  const governoratesReady = governorates.size > 0;
  const savedProblem =
    pickingSaved && saved && governoratesReady
      ? deliveryProblem(saved, governorates)
      : null;
  const typedProblem =
    !pickingSaved && governoratesReady && deliveryValues.governorate_id
      ? deliveryProblem(
          { governorate_id: deliveryValues.governorate_id },
          governorates,
        )
      : null;
  // The delivery fee and the full total for the address being ordered to:
  // the server's figures when signed in, the same arithmetic for a guest.
  const location =
    pickingSaved && saved
      ? {
          addressId: saved.id ?? null,
          governorateId: saved.governorate_id ?? null,
        }
      : {
          addressId: null,
          governorateId: deliveryValues.governorate_id || null,
        };
  const pricing = useDeliveryPricing(view, location);
  const totals = pricing.totals;
  const blocked =
    problemText(
      pickingSaved ? savedProblem : typedProblem,
      pickingSaved ? saved?.governorate_id : deliveryValues.governorate_id,
    ) ??
    // The server refused to price it (the governorate stopped being served).
    problemText(pricing.problem, location.governorateId);

  async function setGovernorate(address: Address, governorateId: string) {
    if (!address.id) return;
    await api.updateAddress(address.id, { governorate_id: governorateId });
    setAddressNotice(null);
    savedAddresses.reload();
  }

  async function placeOrder(accepted?: PriceChange[]) {
    setPlacing(true);
    setError(null);
    setPriceChangeError(null);

    // Snapshot before the server consumes the cart — the confirmation renders
    // from this, and the totals shown are the ones the server just charged.
    const snapshot: CartViewLine[] = lines;
    const snapshotTotals = totals;
    const items: OrderItem[] = lines.map((line) => ({
      id: line.id,
      product_id: line.product_id,
      variant_id: line.variant_id ?? undefined,
      quantity: line.quantity,
      base_unit: line.base_unit ?? "piece",
      whole_units_only: line.whole_units_only ?? true,
      unit_price: line.unit_price,
      line_total: line.line_total,
      discount_share: 0,
      coupon_discount_share: 0,
      tier_discount_share: 0,
      loyalty_discount_share: 0,
      other_adjustment_share: 0,
      net_line_total: line.line_total,
      net_paid_total: line.line_total,
    }));

    try {
      // A saved address already has an id; a typed one is created first, which
      // also saves it to the account for next time.
      let addressId = pickingSaved
        ? (saved?.id ?? null)
        : createdAddressId.current;
      if (!addressId) {
        const created = await api.createAddress(
          toAddressCreate(deliveryValues),
        );
        if (!created.id) {
          throw new ApiError(422, "Address was created without an id");
        }
        addressId = created.id;
        createdAddressId.current = created.id;
      }

      const order = await api.placeOrder(
        {
          address_id: addressId,
          payment_method: "cod",
          coupon_code: couponCode,
          // The idempotency key stays: the refused attempt placed nothing.
          ...(accepted
            ? { accepted_price_versions: acceptedPriceVersions(accepted) }
            : {}),
        },
        {
          idempotencyKey,
          draft: {
            items,
            subtotal: snapshotTotals.subtotal,
            delivery_fee: snapshotTotals.deliveryFee,
            discount: snapshotTotals.discount,
            total: snapshotTotals.total,
          },
        },
      );

      // After accepting new prices the order's own figures are the truth; the
      // cart snapshot still carries the old ones.
      const placedLines = accepted
        ? snapshot.map((line) => {
            const item = (order.items ?? []).find(
              (row) => row.variant_id === line.variant_id,
            );
            return item
              ? {
                  ...line,
                  unit_price: item.unit_price ?? line.unit_price,
                  line_total: item.line_total ?? line.line_total,
                }
              : line;
          })
        : snapshot;
      // The order's own figures are the truth: the delivery fee is only known
      // once the order has a governorate, and accepted prices may differ.
      const discount = order.discount ?? snapshotTotals.discount;
      const tierDiscount = order.tier_discount ?? snapshotTotals.tierDiscount;
      const placedTotals: CartTotals = {
        ...snapshotTotals,
        subtotal: order.subtotal ?? snapshotTotals.subtotal,
        deliveryFee: order.delivery_fee ?? snapshotTotals.deliveryFee,
        deliveryPending: order.delivery_fee === undefined,
        discount,
        couponDiscount:
          order.coupon_discount ?? Math.max(0, discount - tierDiscount),
        tierDiscount,
        tierPercent: order.applied_tier?.percent ?? snapshotTotals.tierPercent,
        total: order.total ?? snapshotTotals.total,
      };
      setPriceChange(null);
      setPlaced({
        order,
        lines: placedLines,
        totals: placedTotals,
        couponCode,
      });
      setStage("done");
      // The server consumed its own cart when it placed the order; this drops
      // the device copy and re-reads what is left.
      await cartStore.onOrderPlaced();
      // The next checkout is a new attempt and must not reuse this key.
      setIdempotencyKey(globalThis.crypto.randomUUID());
    } catch (cause) {
      const changes = priceChanges(cause instanceof ApiError ? cause : null);
      if (changes) {
        setPriceChange(changes);
        return;
      }
      if (cause instanceof ApiError && isAddressRefusal(cause.code)) {
        // The address, not the basket: back to the address step with the
        // reason (the governorates or the address changed meanwhile).
        setPriceChange(null);
        setAddressNotice(t(`delivery.refusal.${cause.code}`));
        savedAddresses.reload();
        governorateList.reload();
        setStage("address");
        return;
      }
      if (accepted) {
        // The acceptance itself was refused (another change, or stock ran out).
        setPriceChangeError(t("priceChange.failed"));
      }
      if (cause instanceof ApiError && cause.status === 409) {
        setPriceChange(null);
        // The basket stopped being buyable between loading this page and
        // pressing the button — something sold out, or a coupon expired.
        // Re-reading the cart is what marks WHICH line is the problem, and the
        // cart is the only screen that can show it, so the shopper goes back
        // there rather than staring at a message beside a dead button.
        //
        // The idempotency key deliberately survives: this attempt placed
        // nothing, so a retry of the same basket must still collapse onto one
        // order if the first response was merely lost.
        await cartStore.refresh();
        showToast(t("orderUnavailable"));
        router.push("/cart");
        return;
      }
      setError(t("orderFailed"));
    } finally {
      setPlacing(false);
    }
  }

  /** Review's CTA: gate on authentication first, then place. */
  function handlePlaceOrder() {
    if (!isAuthenticated) {
      setError(null);
      setStage("auth");
      return;
    }
    void placeOrder();
  }

  if (stage === "done" && placed) {
    return (
      <Wrapper step="done">
        <Confirmation
          order={placed.order}
          lines={placed.lines}
          // The order's own totals when the server sent them, else what was
          // shown at review — never recomputed here.
          totals={placed.totals}
          couponCode={placed.couponCode ?? undefined}
        />
      </Wrapper>
    );
  }

  // Reading localStorage is what tells us whether there is a cart at all, so
  // hold the shell rather than flashing the empty state at every visitor.
  if (!hydrated) {
    return (
      <Wrapper step="address">
        <Card
          padding="lg"
          role="status"
          aria-label={tc("loading")}
          className="motion-safe:animate-pulse"
        >
          <span className="sr-only">{tc("loading")}</span>
          <div aria-hidden className="flex flex-col gap-4">
            <div className="h-5 w-40 rounded bg-card" />
            <div className="h-12 rounded-md bg-card" />
            <div className="h-12 rounded-md bg-card" />
            <div className="h-12 rounded-md bg-card" />
          </div>
        </Card>
      </Wrapper>
    );
  }

  if (lines.length === 0) {
    return (
      <Wrapper step="address">
        <div
          role="status"
          data-testid="checkout-empty"
          className="rounded-lg border border-border bg-surface px-5 py-14 text-center"
        >
          <ShoppingCart
            className="mx-auto size-12 text-primary-dark"
            aria-hidden
          />
          <h2 className="mt-4 text-xl font-bold text-text">
            {t("emptyTitle")}
          </h2>
          <p className="mt-2 text-sm text-text-muted">{t("emptyBody")}</p>
          <Link
            href="/cart"
            className={buttonClasses({ variant: "cta", className: "mt-6" })}
          >
            {t("backToCart")}
          </Link>
        </div>
      </Wrapper>
    );
  }

  if (stage === "auth") {
    return (
      <Wrapper step="auth">
        <AuthGate
          defaultPhone={delivery.phone}
          onBack={() => setStage("review")}
          onSignedIn={() => {
            setStage("review");
            showToast(t("signedIn"));
          }}
        />
      </Wrapper>
    );
  }

  if (stage === "review") {
    return (
      <Wrapper step="review">
        <ReviewStep
          lines={lines}
          couponCode={couponCode}
          serverPriced={pricing.serverPriced}
          totals={totals}
          address={
            pickingSaved && saved
              ? summariseSaved(saved, nameOf(saved.governorate_id))
              : summariseTyped(
                  deliveryValues,
                  nameOf(deliveryValues.governorate_id),
                )
          }
          tiers={pricing.tiers}
          blocked={blocked}
          error={error}
          placing={placing}
          onEditAddress={() => setStage("address")}
          onPlaceOrder={handlePlaceOrder}
        />
        {priceChange ? (
          <PriceChangeDialog
            changes={priceChange}
            lines={lines}
            currency={currency}
            busy={placing}
            error={priceChangeError}
            onAccept={() => void placeOrder(priceChange)}
            onBack={async () => {
              setPriceChange(null);
              await cartStore.refresh();
              router.push("/cart");
            }}
          />
        ) : null}
      </Wrapper>
    );
  }

  // ------------------------------------------------------------ address step
  return (
    <Wrapper step="address">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        {addressNotice ? (
          <p
            role="alert"
            data-testid="checkout-address-notice"
            className="rounded-md border border-error/40 bg-error/8 px-3 py-2 text-sm font-medium text-error-dark"
          >
            {addressNotice}
          </p>
        ) : null}
        {isAuthenticated && !typingNew ? (
          <SavedAddresses
            governorates={governorates}
            onSetGovernorate={setGovernorate}
            addresses={addressBook}
            loading={savedAddresses.loading}
            failed={savedAddresses.failed}
            onRetry={savedAddresses.reload}
            selectedId={saved?.id ?? null}
            onSelect={(address) => {
              setChosenId(address.id ?? null);
              deliveryLocation.setAddress(
                address.id ?? null,
                address.governorate_id ?? null,
              );
            }}
            onUseNew={() => setTypingNew(true)}
          />
        ) : null}

        {pickingSaved ? (
          <>
            <PaymentMethod />
            <Button
              variant="cta"
              size="lg"
              block
              disabled={!saved || Boolean(savedProblem)}
              data-testid="address-submit"
              onClick={() => setStage("review")}
            >
              {t("continue")}
            </Button>
          </>
        ) : (
          <AddressForm
            values={deliveryValues}
            onChange={(next) => {
              setDelivery(next);
              // The governorate typed here prices the cart too.
              if (next.governorate_id !== deliveryValues.governorate_id)
                deliveryLocation.setGovernorate(next.governorate_id || null);
            }}
            onSubmit={() => {
              // A typed address wins over the book until they go back.
              setTypingNew(true);
              setStage("review");
            }}
            submitLabel={t("continue")}
          >
            <PaymentMethod />
          </AddressForm>
        )}
      </div>
    </Wrapper>
  );
}

function Wrapper({ step, children }: { step: Stage; children: ReactNode }) {
  const t = useTranslations("checkout");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="mb-5 text-2xl font-bold text-text lg:text-3xl">
        {t("title")}
      </h1>
      <CheckoutSteps current={STAGE_STEP[step]} />
      {children}
    </div>
  );
}
