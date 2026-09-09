"use client";

import { useTranslations } from "next-intl";
import { ShoppingCart } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** The «سلتك فارغة» state, with the «تصفّح المنتجات» way out of it. */
export function EmptyCart() {
  const t = useTranslations("cart");

  return (
    <div
      role="status"
      data-testid="cart-empty"
      className="rounded-lg border border-border bg-surface px-5 py-14 text-center"
    >
      <ShoppingCart className="mx-auto size-12 text-primary-dark" aria-hidden />
      <h2 className="mt-4 text-xl font-bold text-text">{t("emptyTitle")}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
        {t("emptyBody")}
      </p>
      <Link
        href="/categories"
        className={buttonClasses({ variant: "cta", className: "mt-6" })}
      >
        {t("browse")}
      </Link>
    </div>
  );
}
