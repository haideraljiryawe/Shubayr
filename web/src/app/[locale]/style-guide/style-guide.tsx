"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Filter, ScanLine, ShoppingCart, SlidersHorizontal } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Field,
  Input,
  Price,
  QuantityStepper,
  Radio,
  Rating,
  SearchInput,
  SectionHeader,
  Select,
  Textarea,
  Toggle,
  WishlistButton,
} from "@/components/ui";
import { contrastRatio, parseHex } from "@/lib/color";
import { formatDiscount } from "@/lib/format";
import { demoProducts } from "@/lib/mock-data";

/* ---------------------------------------------------------------------------
 * The phase-1 verification surface: every token and every base component in all
 * its states, so the build can be eyeballed against the design sheet.
 * ------------------------------------------------------------------------- */

interface Swatch {
  name: string;
  hex: string;
  /** Tailwind class driven by the token — proves the theme mapping works. */
  className: string;
  border?: boolean;
}

const PRIMARY_SWATCHES: Swatch[] = [
  { name: "Primary", hex: "#558464", className: "bg-primary" },
  { name: "Primary Dark", hex: "#3E6B4E", className: "bg-primary-dark" },
  { name: "Primary Light", hex: "#7FAE8C", className: "bg-primary-light" },
  { name: "Accent", hex: "#D4A017", className: "bg-accent" },
  { name: "Background", hex: "#FAF7F2", className: "bg-background", border: true },
];

const SECONDARY_SWATCHES: Swatch[] = [
  { name: "Surface", hex: "#FFFFFF", className: "bg-surface", border: true },
  { name: "Card", hex: "#F4F1EA", className: "bg-card", border: true },
  { name: "Border", hex: "#E5E1D8", className: "bg-border", border: true },
  { name: "Text Primary", hex: "#1F2937", className: "bg-text" },
  { name: "Text Secondary", hex: "#4B5563", className: "bg-text-muted" },
];

const STATUS_SWATCHES: Swatch[] = [
  { name: "Success", hex: "#22C55E", className: "bg-success" },
  { name: "Warning", hex: "#F59E0B", className: "bg-warning" },
  { name: "Error", hex: "#EF4444", className: "bg-error" },
  { name: "Info", hex: "#3B82F6", className: "bg-info" },
];

const WEIGHTS = [
  { label: "Light", value: 300, className: "font-light" },
  { label: "Regular", value: 400, className: "font-normal" },
  { label: "Medium", value: 500, className: "font-medium" },
  { label: "SemiBold", value: 600, className: "font-semibold" },
  { label: "Bold", value: 700, className: "font-bold" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-12 first:mt-0">
      <h2 className="text-xl font-bold text-text">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SwatchGrid({ swatches }: { swatches: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {swatches.map((swatch) => (
        <div key={swatch.name} className="flex flex-col gap-2">
          <div
            className={`h-20 rounded-md shadow-sm ${swatch.className} ${
              swatch.border ? "border border-border" : ""
            }`}
          />
          <div className="leading-tight">
            <p className="text-sm font-medium text-text">{swatch.name}</p>
            <p dir="ltr" className="font-mono text-xs text-text-muted">
              {swatch.hex}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Contrast of white text on a given background, to two decimals. */
function whiteContrast(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "—";
  return contrastRatio(rgb, { r: 255, g: 255, b: 255 }).toFixed(2);
}

export function StyleGuide() {
  const t = useTranslations("styleGuide");
  const tc = useTranslations("common");
  const product = demoProducts[0];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <header>
        <h1 className="text-3xl font-bold text-text">{t("title")}</h1>
        <p className="mt-1 text-text-muted">{t("subtitle")}</p>
      </header>

      {/* ----------------------------------------------------- colors ---- */}
      <Section title={t("primaryColors")}>
        <SwatchGrid swatches={PRIMARY_SWATCHES} />
      </Section>

      <Section title={t("secondaryColors")}>
        <SwatchGrid swatches={SECONDARY_SWATCHES} />
      </Section>

      <Section title={t("statusColors")}>
        <SwatchGrid swatches={STATUS_SWATCHES} />
      </Section>

      {/* The one spot where the design sheet contradicts itself, surfaced here
          so the decision stays visible instead of buried in a commit message. */}
      <Section title={t("brandNote")}>
        <Card padding="lg">
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              { label: t("mockup"), hex: "#558464", chosen: true },
              { label: t("spec"), hex: "#5BBF6B", chosen: false },
            ].map((option) => (
              <div key={option.hex} className="flex items-center gap-4">
                <div
                  className="flex size-20 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-white shadow-sm"
                  style={{ backgroundColor: option.hex }}
                >
                  Aa
                </div>
                <div className="leading-relaxed">
                  <p className="text-sm font-semibold text-text">
                    {option.label}
                    {option.chosen ? (
                      <Badge tone="success" className="ms-2">
                        ✓
                      </Badge>
                    ) : null}
                  </p>
                  <p dir="ltr" className="font-mono text-xs text-text-muted">
                    {option.hex}
                  </p>
                  <p className="mt-1 text-xs text-text-muted">
                    {t("contrast")}:{" "}
                    <span dir="ltr">{whiteContrast(option.hex)}:1</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {/* ------------------------------------------------- typography ---- */}
      <Section title={t("typography")}>
        <Card padding="lg">
          <div className="flex flex-wrap items-baseline justify-between gap-6">
            <div>
              <p className="text-2xl font-bold text-text">Cairo</p>
              <p className="mt-2 text-xl text-text">أبجد هوز حطي كلمن</p>
              <p className="text-xl text-text">The quick brown fox</p>
            </div>
            <p className="text-6xl font-semibold text-text">Aa</p>
          </div>

          <div className="mt-8 space-y-3 border-t border-border pt-6">
            {WEIGHTS.map((weight) => (
              <div
                key={weight.value}
                className="flex flex-wrap items-baseline gap-x-6 gap-y-1"
              >
                <span className="w-28 shrink-0 text-xs text-text-muted">
                  {weight.label} {weight.value}
                </span>
                <span className={`text-lg text-text ${weight.className}`}>
                  كل ما تحتاجه في مكان واحد
                </span>
                <span className={`text-lg text-text ${weight.className}`}>
                  Everything you need
                </span>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {/* ---------------------------------------------------- buttons ---- */}
      <Section title={t("buttons")}>
        <Card padding="lg">
          <div className="grid gap-4 sm:grid-cols-2">
            <Button block>{t("primaryButton")}</Button>
            <Button block variant="secondary">
              {t("secondaryButton")}
            </Button>
            <Button block variant="light">
              {t("lightButton")}
            </Button>
            <Button block disabled>
              {t("disabledButton")}
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button
              size="lg"
              startIcon={<ShoppingCart className="size-5" aria-hidden />}
            >
              {tc("addToCart")}
            </Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </Card>
      </Section>

      {/* ----------------------------------------------------- fields ---- */}
      <Section title={t("fields")}>
        <Card padding="lg">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label={t("fieldLabel")} htmlFor="sg-input">
              <Input id="sg-input" placeholder={t("fieldText")} />
            </Field>

            <Field label={t("fieldLabel")} htmlFor="sg-select">
              <Select id="sg-select" placeholder={t("selectPlaceholder")}>
                <option value="1">إلكترونيات</option>
                <option value="2">المنزل والمطبخ</option>
                <option value="3">الملابس والأزياء</option>
              </Select>
            </Field>

            <Field label={t("fieldLabel")} htmlFor="sg-search">
              <SearchInput
                id="sg-search"
                placeholder={t("fieldText")}
                endIcon={<ScanLine className="size-4.5" aria-hidden />}
              />
            </Field>

            {/* Error state — red border plus inline message, as in the sheet. */}
            <Field
              label={t("fieldLabel")}
              htmlFor="sg-error"
              error={t("errorMessage")}
            >
              <Input id="sg-error" invalid defaultValue={t("errorField")} />
            </Field>

            <Field
              label={t("fieldLabel")}
              htmlFor="sg-textarea"
              className="sm:col-span-2"
            >
              <Textarea id="sg-textarea" placeholder={t("textareaPlaceholder")} />
            </Field>

            <Field label={t("fieldLabel")} htmlFor="sg-disabled">
              <Input id="sg-disabled" disabled placeholder={t("fieldText")} />
            </Field>
          </div>
        </Card>
      </Section>

      {/* --------------------------------------------------- elements ---- */}
      <Section title={t("elements")}>
        <Card padding="lg">
          <div className="flex flex-wrap items-center gap-x-10 gap-y-6">
            <Toggle defaultChecked label="On" />
            <Toggle label="Off" />
            <Toggle disabled label="Disabled" />
            <Checkbox defaultChecked label="Checked" />
            <Checkbox label="Unchecked" />
            <Checkbox disabled label="Disabled" />
            <Radio name="sg-radio" defaultChecked label="Selected" />
            <Radio name="sg-radio" label="Unselected" />
            <Radio name="sg-radio-2" disabled label="Disabled" />
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-6 border-t border-border pt-6">
            <QuantityStepper defaultValue={1} max={10} />
            <WishlistButton />
            <WishlistButton defaultActive />
            <Avatar name="أحمد علي" />
            <Avatar name="Ahmed Ali" size="lg" />
            <Avatar size="sm" />
            <Chip selected startIcon={<Filter className="size-3.5" aria-hidden />}>
              تصفية
            </Chip>
            <Chip
              startIcon={<SlidersHorizontal className="size-3.5" aria-hidden />}
            >
              ترتيب
            </Chip>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-6">
            <Badge tone="sale">-40%</Badge>
            <Badge tone="primary">جديد</Badge>
            <Badge tone="accent">مميز</Badge>
            <Badge tone="success">Success</Badge>
            <Badge tone="warning">Warning</Badge>
            <Badge tone="error">Error</Badge>
            <Badge tone="info">Info</Badge>
            <Badge>Neutral</Badge>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-8 border-t border-border pt-6">
            <Price
              amount={product.effective_price}
              regularPrice={product.on_sale ? product.price : null}
              size="lg"
            />
            <Price amount={299} />
            <Rating value={product.rating_avg} count={product.review_count} />
            <Rating value={4.6} count={98} showStars />
          </div>
        </Card>
      </Section>

      {/* ------------------------------------------- radii and shadows ---- */}
      <Section title={t("radiiAndShadows")}>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: t("radiusSmall"), radius: "rounded-sm", px: 8 },
            { label: t("radiusMedium"), radius: "rounded-md", px: 12 },
            { label: t("radiusLarge"), radius: "rounded-lg", px: 20 },
          ].map((item) => (
            <div key={item.px} className="flex flex-col items-center gap-2">
              <div
                className={`h-24 w-full border border-border bg-surface shadow-sm ${item.radius}`}
              />
              <p className="text-sm font-medium text-text">{item.label}</p>
              <p dir="ltr" className="text-xs text-text-muted">
                radius {item.px}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: t("shadowSmall"), shadow: "shadow-sm" },
            { label: t("shadowMedium"), shadow: "shadow-md" },
            { label: t("shadowLarge"), shadow: "shadow-lg" },
          ].map((item) => (
            <div key={item.shadow} className="flex flex-col items-center gap-2">
              <div className={`h-24 w-full rounded-lg bg-surface ${item.shadow}`} />
              <p className="text-sm font-medium text-text">{item.label}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* -------------------------------------------------- components ---- */}
      <Section title={t("components")}>
        <SectionHeader
          title={t("featuredProducts")}
          actionLabel={tc("viewAll")}
          href="/style-guide"
        />

        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {demoProducts.map((item) => (
            <Card
              key={item.id}
              padding="none"
              interactive
              className="overflow-hidden"
            >
              <div className="relative aspect-square bg-card">
                <div className="absolute start-2 top-2 z-10">
                  {item.on_sale ? (
                    <Badge tone="sale">
                      {formatDiscount(item.discount_percent ?? 0)}
                    </Badge>
                  ) : null}
                </div>
                <div className="absolute end-2 top-2 z-10">
                  <WishlistButton size="sm" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5 p-3">
                <p className="truncate text-sm font-medium text-text">
                  {item.name_ar}
                </p>
                <Price
                  amount={item.effective_price}
                  regularPrice={item.on_sale ? item.price : null}
                />
                <Rating value={item.rating_avg} count={item.review_count} />
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
