"use client";

import { useTranslations } from "next-intl";
import { CatalogError } from "@/components/catalog/states";

export default function CategoriesError({ retry }: { retry: () => void }) {
  const nav = useTranslations("nav");

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="mb-6 text-2xl font-bold text-text lg:text-3xl">
        {nav("categories")}
      </h1>
      <CatalogError retry={retry} />
    </div>
  );
}
