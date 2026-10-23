/**
 * The one look every form control shares (VIS-006 / VIS-018): text, number,
 * search, date, password, textarea, the Select trigger and the file picker's
 * status box. A darker field border, a green focus ring, and error and
 * disabled states that keep their own meaning while focused.
 */
export const CONTROL =
  "w-full rounded-md border border-field bg-surface px-3 text-control text-text " +
  "placeholder:text-text-muted/70 transition-[border-color,box-shadow] duration-150 " +
  "hover:border-field-hover " +
  "focus:border-primary focus:outline-none focus:ring-3 focus:ring-primary/30 " +
  "disabled:cursor-not-allowed disabled:border-border disabled:bg-card disabled:text-text-muted " +
  "aria-[invalid=true]:border-error aria-[invalid=true]:focus:ring-error/25";
