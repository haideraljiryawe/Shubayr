# Customer mock journeys

## Implemented in this increment

- Guest sign-in carries a validated local `returnTo` through the OTP flow.
  Successful customer sign-in returns to the product, search, account, or guarded
  customer destination. No add-to-cart, wishlist, checkout, or other mutation is
  replayed. Staff and delivery accounts still land in their own areas.
- Delivered orders expose **Review products** and **Request a return**.
- Product reviews select an actual order item, require 1–5 stars, and accept an
  optional comment. Mock submissions stay `pending`, not publicly published.
- Partial returns select quantities per order item, leaving unselected items at
  zero. The receipt shows the request reference and submitted items. Creating a
  request does not approve a return, issue a refund, or modify stock.
- Mock and remote implementations share `AfterSalesRepository`; remote requests
  follow existing OpenAPI operations. Remote integration is not verified against
  a live backend in this increment.

## Try it with mock data

Run with `DATA_SOURCE=mock` (the default). A valid phone ending in a digit other
than 1 or 2 signs in as a customer; use any six-digit OTP in mock mode only.

1. As a guest, open a product, tap Add to cart, then Sign in in the prompt.
   After OTP, the same product opens. Tap Add to cart yourself to add it.
2. Open Orders → delivered demo order **SH-1042**. It contains three units of
   one product and one of another to exercise partial quantities.
3. Submit a product review; reopen the form to review the other item.
4. Request one unit of the first item for return. The second item stays untouched.
   Reopening the form within the session subtracts quantities already requested.

## Deliberate contract boundaries

- Delivery rating is deferred: `POST /deliveries/{id}/rating` exists, but the
  customer Order/OrderTracking schemas do not expose a delivery ID and there is
  no customer delivery lookup. Do not substitute an order ID or use the
  delivery-agent-only assigned list.
- The contract has no customer return-history endpoint or own-review-status
  endpoint. The UI therefore remembers only receipts obtained in the current
  session. These are not a complete account history. Mock receipts reset on
  sign-out or restart; real eligibility and duplicate checks remain the server's
  responsibility. Network failure preserves form input; no automatic retry of
  submissions is performed.
- No API contract, backend, database, or public web project changes are needed
  for the implemented portion.

## Still outside this increment

Loyalty screens, help/privacy content, profile completion, notification simulation,
order-list pagination, and automatic tracking updates remain separate work.

## Verification

Relevant tests: `test/app/customer_sign_in_navigation_test.dart`,
`test/app/router/sign_in_destination_test.dart`,
`test/features/orders/after_sales_repository_test.dart`, and
`test/features/orders/after_sales_screens_test.dart`.
The repository tests intercept HTTP locally; no live backend is contacted.

Verified for this increment: all 115 Flutter tests pass and `flutter analyze`
reports no issues. On the iPhone 17 Pro simulator, the Arabic light-mode flow was
checked through guest sign-in → original product → Back, then a submitted review
and a one-unit partial-return receipt. Narrow Arabic light/dark layouts are also
covered by widget tests; dark-mode simulator visuals were not manually checked.
