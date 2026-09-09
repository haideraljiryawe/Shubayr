"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ShoppingCart } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { Link } from "@/i18n/navigation";
import { useSession } from "@/lib/auth";
import { ApiError, api, type Order, type OrderItem } from "@/lib/api";
import { cartTotals, lineTotal } from "@/lib/cart";
import { cartStore, type AppliedCoupon, type CartLine } from "@/lib/cart-store";
import { DELIVERY_FEE } from "@/lib/config";
import { useCart } from "@/lib/use-cart";
import {
  AddressForm,
  EMPTY_DELIVERY,
  toAddressInput,
  type DeliveryDetails,
} from "./address-form";
import { AuthGate } from "./auth-gate";
import { Confirmation } from "./confirmation";
import { PaymentMethod } from "./payment-method";
import { ReviewStep } from "./review-step";
import { CheckoutSteps, type CheckoutStepKey } from "./steps";

/**
 * Address → (sign-in, when needed) → Review → Confirmation.
 *
 * The sign-in step is not one of the numbered steps: the contract requires an
 * authenticated customer for POST /orders, so it appears between review and
 * placement only while the shopper is signed out. It sits behind one `if`, which
 * is what the account phase deletes when real login exists.
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
  lines: CartLine[];
  coupon: AppliedCoupon | null;
}

export function CheckoutFlow() {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const showToast = useToast();
  const { lines, coupon, hydrated } = useCart();
  const { isAuthenticated, signIn } = useSession();

  const [stage, setStage] = useState<Stage>("address");
  const [delivery, setDelivery] = useState<DeliveryDetails>(EMPTY_DELIVERY);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  const totals = cartTotals(lines, coupon, DELIVERY_FEE);

  async function placeOrder() {
    setPlacing(true);
    setError(null);

    // Snapshot before the cart is cleared — the confirmation renders from this.
    const snapshot: CartLine[] = lines;
    const items: OrderItem[] = lines.map((line) => ({
      id: line.id,
      product_id: line.product_id,
      variant_id: line.variant_id,
      quantity: line.quantity,
      unit_price: line.unit_price,
      line_total: lineTotal(line),
    }));

    try {
      // The contract references an address by id, so a typed-in address is
      // created first and the order is placed against what comes back.
      const address = await api.createAddress(toAddressInput(delivery));
      if (!address.id) throw new ApiError(422, "Address was created without an id");

      const order = await api.placeOrder(
        {
          address_id: address.id,
          payment_method: "cod",
          coupon_code: coupon?.code ?? null,
        },
        {
          items,
          subtotal: totals.subtotal,
          delivery_fee: totals.deliveryFee,
          discount: totals.discount,
          total: totals.total,
        },
      );

      setPlaced({ order, lines: snapshot, coupon });
      setStage("done");
      cartStore.clear();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 409
          ? t("orderUnavailable")
          : t("orderFailed"),
      );
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
          totals={cartTotals(placed.lines, placed.coupon, DELIVERY_FEE)}
          couponCode={placed.coupon?.code}
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
          onSignedIn={(phone) => {
            signIn(phone);
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
          coupon={coupon}
          totals={totals}
          delivery={delivery}
          error={error}
          placing={placing}
          onEditAddress={() => setStage("address")}
          onPlaceOrder={handlePlaceOrder}
        />
      </Wrapper>
    );
  }

  return (
    <Wrapper step="address">
      <div className="mx-auto max-w-2xl">
        <AddressForm
          values={delivery}
          onChange={setDelivery}
          onSubmit={() => setStage("review")}
          submitLabel={t("continue")}
        >
          <PaymentMethod />
        </AddressForm>
      </div>
    </Wrapper>
  );
}

function Wrapper({
  step,
  children,
}: {
  step: Stage;
  children: ReactNode;
}) {
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
