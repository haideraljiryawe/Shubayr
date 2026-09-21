"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ShoppingCart } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/lib/auth";
import { ApiError, api, type Address, type Order, type OrderItem } from "@/lib/api";
import type { CartTotals } from "@/lib/cart";
import { cartStore } from "@/lib/cart-store";
import { useCart, type CartViewLine } from "@/lib/use-cart";
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

function summariseSaved(address: Address): ChosenAddress {
  return {
    id: address.id ?? null,
    title: address.label ?? "",
    phone: null,
    lines: [
      [address.city, address.area, address.street].filter(Boolean).join(" — "),
      address.details ?? "",
    ].filter(Boolean),
  };
}

function summariseTyped(delivery: DeliveryDetails): ChosenAddress {
  return {
    id: null,
    title: delivery.name,
    phone: delivery.phone,
    lines: [
      [delivery.city, delivery.area, delivery.street].filter(Boolean).join(" — "),
      delivery.details,
    ].filter(Boolean),
  };
}

export function CheckoutFlow() {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const showToast = useToast();
  const router = useRouter();
  const { lines, totals, hydrated, couponCode, isServerBacked } = useCart();
  const { isAuthenticated, user } = useAuth();

  const [stage, setStage] = useState<Stage>("address");
  const [delivery, setDelivery] = useState<DeliveryDetails>(EMPTY_DELIVERY);
  /** The saved address the customer picked, if they picked one. */
  const [chosenId, setChosenId] = useState<string | null>(null);
  /** True once they choose to type a new address instead of picking. */
  const [typingNew, setTypingNew] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  // Saved addresses belong to a signed-in customer; a guest has none to read.
  const savedAddresses = useResource<Address[]>(
    () => (isAuthenticated ? api.listAddresses() : Promise.resolve([])),
    [isAuthenticated],
  );
  const addressBook = savedAddresses.data ?? [];

  // Derived, not stored: the explicit pick, else the account default, else the
  // first one. No effect has to reconcile a selection with a list that arrives
  // later.
  const saved =
    addressBook.find((item) => item.id === chosenId) ??
    addressBook.find((item) => item.is_default) ??
    addressBook[0] ??
    null;

  // A signed-in shopper's own name and number are the delivery contact, so the
  // "new address" form starts filled in rather than blank.
  const deliveryValues: DeliveryDetails = {
    ...delivery,
    name: delivery.name || (user?.name ?? ""),
    phone: delivery.phone || (user?.phone ?? ""),
  };

  const pickingSaved = isAuthenticated && !typingNew && addressBook.length > 0;

  async function placeOrder() {
    setPlacing(true);
    setError(null);

    // Snapshot before the server consumes the cart — the confirmation renders
    // from this, and the totals shown are the ones the server just charged.
    const snapshot: CartViewLine[] = lines;
    const snapshotTotals = totals;
    const items: OrderItem[] = lines.map((line) => ({
      id: line.id,
      product_id: line.product_id,
      variant_id: line.variant_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: line.line_total,
    }));

    try {
      // A saved address already has an id; a typed one is created first, which
      // also saves it to the account for next time.
      let addressId = pickingSaved ? (saved?.id ?? null) : null;
      if (!addressId) {
        const created = await api.createAddress(toAddressCreate(deliveryValues));
        if (!created.id) {
          throw new ApiError(422, "Address was created without an id");
        }
        addressId = created.id;
      }

      const order = await api.placeOrder(
        {
          address_id: addressId,
          payment_method: "cod",
          coupon_code: couponCode,
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

      setPlaced({ order, lines: snapshot, totals: snapshotTotals, couponCode });
      setStage("done");
      // The server consumed its own cart when it placed the order; this drops
      // the device copy and re-reads what is left.
      await cartStore.onOrderPlaced();
      // The next checkout is a new attempt and must not reuse this key.
      setIdempotencyKey(globalThis.crypto.randomUUID());
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
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
          <h2 className="mt-4 text-xl font-bold text-text">{t("emptyTitle")}</h2>
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
          serverPriced={isServerBacked}
          totals={totals}
          address={
            pickingSaved && saved
              ? summariseSaved(saved)
              : summariseTyped(deliveryValues)
          }
          error={error}
          placing={placing}
          onEditAddress={() => setStage("address")}
          onPlaceOrder={handlePlaceOrder}
        />
      </Wrapper>
    );
  }

  // ------------------------------------------------------------ address step
  return (
    <Wrapper step="address">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        {isAuthenticated && !typingNew ? (
          <SavedAddresses
            addresses={addressBook}
            loading={savedAddresses.loading}
            failed={savedAddresses.failed}
            onRetry={savedAddresses.reload}
            selectedId={saved?.id ?? null}
            onSelect={(address) => setChosenId(address.id ?? null)}
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
              disabled={!saved}
              data-testid="address-submit"
              onClick={() => setStage("review")}
            >
              {t("continue")}
            </Button>
          </>
        ) : (
          <AddressForm
            values={deliveryValues}
            onChange={setDelivery}
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
