import { redirect } from "next/navigation";

/** The purchasing area opens on its invoices. */
export default function PurchasingPage() {
  redirect("/purchasing/invoices");
}
