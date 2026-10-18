import type { BadgeTone } from "@/components/ui";
import type { BannerStatus } from "@/lib/banners";

export const STATUS_TONE: Record<BannerStatus, BadgeTone> = {
  active: "success",
  scheduled: "info",
  expired: "warning",
  disabled: "neutral",
};
