import { useTranslations } from "next-intl";
import { CategoryGridSkeleton } from "@/components/catalog/category-grid";

export default function CategoriesLoading() {
  const nav = useTranslations("nav");
  const catalog = useTranslations("catalog");

  return (
    <div
      aria-busy="true"
      className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8"
    >
      <div className="mb-5 flex min-h-11 items-center sm:mb-6">
        <h1 className="text-2xl font-bold text-text lg:text-3xl">
          {nav("categories")}
        </h1>
      </div>
      <span role="status" className="sr-only">
        {catalog("loading")}
      </span>
      <CategoryGridSkeleton />
    </div>
  );
}
