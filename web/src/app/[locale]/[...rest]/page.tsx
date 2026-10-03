import { notFound } from "next/navigation";

/** Any path no route matches renders the localized 404 (with the store's shell). */
export default function CatchAll() {
  notFound();
}
