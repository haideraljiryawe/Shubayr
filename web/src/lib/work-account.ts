import type { AppRole, User } from "./api";
import { useAuth } from "./auth";

/* ---------------------------------------------------------------------------
 * Work accounts (API 6.0).
 *
 * A phone registered by staff as a `delivery_agent` or `order_monitor` signs in
 * through the same OTP form as a customer, but the API refuses it every
 * purchase function (cart, checkout, wishlist, addresses, reviews, returns,
 * loyalty) with 403 WORK_ACCOUNT_SHOPPING_FORBIDDEN. The storefront therefore
 * shows such a session only a work-account landing page. The role on the user
 * is server-resolved and authoritative; the client never picks it.
 * ------------------------------------------------------------------------- */

export type WorkRole = Extract<AppRole, "delivery_agent" | "order_monitor">;

export function workRoleOf(user: User | null | undefined): WorkRole | null {
  const role = user?.role;
  return role === "delivery_agent" || role === "order_monitor" ? role : null;
}

/** The signed-in work role, or null for guests and customers. */
export function useWorkRole(): WorkRole | null {
  const { user } = useAuth();
  return workRoleOf(user);
}
