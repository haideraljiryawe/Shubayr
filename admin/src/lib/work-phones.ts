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
 * The contract documents `phone` on the row. Accept the older nested
 * `user.phone` shape as well so cached legacy responses remain harmless.
 */
export function toWorkPhoneRow(
  raw: Omit<WorkPhone, "phone"> & {
    phone?: string | null;
    user?: { phone?: string | null };
  },
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
