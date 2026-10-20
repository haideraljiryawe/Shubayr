// Static image imports (src/assets/brand) get their types even before
// `next dev`/`next build` writes next-env.d.ts, which is not committed —
// so the typecheck that CI runs before building sees them too.
/// <reference types="next/image-types/global" />
