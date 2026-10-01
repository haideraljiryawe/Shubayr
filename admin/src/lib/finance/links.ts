import { inventoryEntrySourceHref } from "@/lib/inventory";

/* ---------------------------------------------------------------------------
 * Direct links into the ledger (contract 8.1): one journal entry
 * (GET /admin/ledger/entries/{id}) and one posted financial document
 * (GET /admin/financial-documents/{id}).
 * ------------------------------------------------------------------------- */

/** Source types whose source_id is a financial document with its own page. */
export const DOCUMENT_SOURCES = ["cash_opening_balance", "cash_transfer"] as const;

export function entryHref(id: string): string {
  return `/finance/ledger/entries/${encodeURIComponent(id)}`;
}

export function documentHref(id: string): string {
  return `/finance/documents/${encodeURIComponent(id)}`;
}

/**
 * The page of the document an entry was posted from, if it has one: a
 * financial document, or (API 8.2) an inventory opening, count or write-down.
 */
export function sourceDocumentHref(entry: { source_type: string; source_id: string }): string | null {
  return (DOCUMENT_SOURCES as readonly string[]).includes(entry.source_type)
    ? documentHref(entry.source_id)
    : inventoryEntrySourceHref(entry);
}
