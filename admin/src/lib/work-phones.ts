import type { components } from "@/types/api";

export type WorkPhone = components["schemas"]["WorkPhone"];
export type WorkRole = WorkPhone["app_role"];
export const WORK_ROLES: readonly WorkRole[] = [
  "delivery_agent",
  "order_monitor",
];

/** What the admin shows for a work phone. */
export interface WorkPhoneRow {
  id: string;
  userId: string;
  phone: string;
  name: string;
  role: WorkRole;
  isActive: boolean;
}

/**
 * Normalise GET /admin/work-phones rows.
 *
 * The contract documents `phone` on the row, but API 6.1 serves it nested as
 * `user.phone` (the raw work-profile record). Accept either, so the screen is
 * right today and stays right once the backend matches its contract.
 */
export function toWorkPhoneRow(
  raw: WorkPhone & { user?: { phone?: string | null } },
): WorkPhoneRow {
  return {
    id: raw.id,
    userId: raw.user_id,
    phone: raw.phone ?? raw.user?.phone ?? "",
    name: raw.name,
    role: raw.app_role,
    isActive: raw.is_active,
  };
}
