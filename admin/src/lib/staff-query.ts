import type { components } from "@/types/api";

/**
 * A staff account as GET /admin/staff lists it. Searching, filtering, sorting
 * and paging now run on the API (see src/lib/list-queries.ts).
 */
export type StaffUser = components["schemas"]["StaffUser"];
