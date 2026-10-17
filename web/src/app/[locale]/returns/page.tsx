import { legalRoute } from "@/components/legal/legal-route";

// Open even while the store is "opening soon" (src/lib/store-gate.ts).
const route = legalRoute("returns");

export const generateMetadata = route.generateMetadata;
export default route.Page;
