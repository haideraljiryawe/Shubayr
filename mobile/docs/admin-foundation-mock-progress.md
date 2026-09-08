# Store administration foundation — mock progress

Date: 2026-09-08. Scope: the first phase-3 roadmap item, inside `mobile/` only.
Implementation is ready for Ahmed's final manual verification. No live backend
integration is claimed, and the independent `web/` project is untouched.

Ahmed requested committing the current implementation on 2026-09-08; his design
observations are deferred to a later pass. This snapshot does not mark final
visual acceptance complete.

## Implemented

- Permission-aware dashboard routes for Catalog → Products / Categories,
  Users & roles → Users / Roles, Purchasing → Suppliers, Inventory → Warehouses.
  Remaining operational sections retain their placeholders.
- Product and category creation, editing and confirmed deletion (product deletion
  archives). Product forms cover bilingual names, category, description, price,
  negotiability/floor price, redemption-point cost, expiry tracking, status,
  image URLs and variants with SKU, attributes and price differences. Category
  forms cover parent, bilingual names, icon name, ordering and active state.
- User creation, editing, deletion, role assignment, active state and optional
  password input; user permissions remain read-only and derive from the role.
  Role CRUD and permission selection use `/admin/permissions` keys with localized
  labels. Passwords are not returned or retained by the mock repository.
- Paginated products, users, roles, suppliers, warehouses and warehouse-scoped
  locations. Categories use their complete tree response and permissions use
  their complete array, as specified by the contract. Dropdown lookups load every
  page, including later-page roles. Product/user searches and user role filtering
  reach the repository before pagination, with matching totals in mock mode.
- Supplier list and creation. Warehouse/location selection is held in session
  memory; switching warehouses clears the old location, inactive warehouses
  cannot be selected, and changing user/permissions resets the selection.
- Initial retry, pull-to-refresh, append retry preserving existing records,
  mutation failure preserving the form, confirmation before deletion, duplicate
  operation guards and stale-response protection. A failed reload after a
  successful save does not misreport the save as failed.
- Existing role and permission rules gate screens and repository controllers;
  granting access in the UI does not substitute for backend authorization.
- Shared themes, cards, buttons, skeletons and snackbars; Arabic/English and RTL.
  Long forms keep every field mounted so offscreen validation remains effective.
- `AdminRepositoryMock` / `AdminRepositoryRemote` preserve the existing
  `DATA_SOURCE` switch. Remote payloads whitelist contract input fields, omitting
  stock, variant IDs, user permissions and other computed/read-only properties.
- The admin mock shares catalog changes with customer browsing during the app
  run, including category order and active state, product visibility and images.
  Newly created products have zero stock; inventory receiving remains a separate
  roadmap operation. Restarting the app resets the in-memory administration data.

## Contract boundaries and follow-up

- Product/category reads currently use `/products` and `/categories`. The
  contract provides admin writes but no separate admin read endpoint or explicit
  guarantee that these reads include hidden/archived products and inactive
  categories. Mock management retains those records. Before remote acceptance,
  the API team must confirm authenticated admin read visibility or document an
  admin read extension; no unsupported visibility query was added.
- Supplier update/delete and warehouse/location creation/edit/delete are absent
  from this contract. Only the specified supplier read/create and warehouse/
  location read/select operations are implemented.
- Images are URL fields because ProductInput accepts URLs; file upload is not
  defined here. Redemption-point cost is a catalog field, not points earning,
  balance, negotiation or redemption functionality.
- Existing mock authentication still uses the phone-based role fixtures. Creating
  a user/role or changing its permissions updates administration records, not the
  current login session or authentication fixtures. Testing login with newly
  managed accounts/custom roles and refreshing their session permissions requires
  the separate authentication/backend integration. No auth behavior was changed.
- Mock safeguards reject category cycles, deletion of referenced categories,
  deletion of system/assigned roles, duplicate role names and duplicate user
  phones. System role names are protected in the form. These are local protective
  mock policies; actual server validation and system-role policy remain
  authoritative at integration time.
- Purchase invoices, stock adjustments/transfers, order processing and reports
  remain separate phase-3 tasks. Selection is foundation state for those journeys,
  not an inventory write or receipt.

## Technical verification

- Dart formatting and localization generation completed.
- `flutter analyze`: passed without issues.
- 31 focused administration tests cover mock/remote contracts, CRUD and role
  assignment, search/filter pagination, all-page lookups, retry and refresh,
  permission/session changes, catalog synchronization, actual form submissions,
  delete confirmation/cancellation, variant removal, and warehouse navigation to
  a location on the second page.
- Widget layout checks cover 320, 402 and 1280 pixels, Arabic/English and both
  light/dark themes. These are automated widget checks, not simulator acceptance.
- Full `flutter test`: all 286 tests passed.
- `flutter build web --dart-define=DATA_SOURCE=mock`: succeeded.
- No live backend was contacted.

## Final manual check (pending)

Use `DATA_SOURCE=mock`; sign in with the existing admin fixture (phone ending in
`2`, test OTP `123456`), then:

1. Open Catalog. Create a category and product, edit them, and test archive/delete
   confirmation. Check variant/attribute controls and image URLs; a new product
   starts out of stock. Check Arabic/English and dark mode on the usual phone.
2. Open Users & roles. Create a role with selected permissions, assign it to a
   user, edit/deactivate the user, and search/filter. Changes should remain after
   leaving and returning to the list within the same app run.
3. Open Purchasing. Scroll past the initial supplier page and add a supplier.
4. Open Inventory. Choose a warehouse and a location beyond the first 20, return
   and choose another warehouse; the previous location must be cleared.
5. Scroll long forms to Save with missing/invalid fields; they must not save.
   Confirm cancellation leaves records intact. Check narrow screens if available.
