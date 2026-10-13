# Mobile contract notes: v15.0 → v15.1

Version 15.1 is additive and has no breaking customer-app behavior.

Customer-facing catalog responses may now include:

- `Product.description_en` and `Product.description_ar`, both nullable. The
  existing `description` field remains unchanged.
- `ProductVariant.barcode`, nullable. Mobile clients may ignore it.

All Excel import, import history, bulk-image upload, large-catalog filtering,
and bulk product mutation routes are Web Admin-only and require staff
permissions. No mobile screen, delivery-agent feature, or mobile request body
changes in this release.
