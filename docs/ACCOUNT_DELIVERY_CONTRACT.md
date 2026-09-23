# Account, address, order, and delivery contract

## Address ownership and defaults

Addresses are always scoped to the authenticated owner; cross-account IDs are
reported as 404. `contact_phone` is a required string belonging to the address
and may equal or differ from the account phone. The API never stores a boolean
"use account phone" reference.

The first address is made default. Setting another address as default clears
the previous default atomically. Clearing the only default while any address
remains returns 409. Deleting the default promotes the oldest remaining address
by `created_at`, then `id`. These transitions must be transactional.

## Checkout snapshot decision

Approved: checkout copies the selected owned address and its contact into the
order's `delivery_*` fields in the order-creation transaction. These fields are
immutable. `address_id` remains provenance only; editing or deleting an address
does not change a placed order. Existing data is backfilled from its referenced
address and owner phone.

## Delivery, ratings, returns, and reviews

`Order.delivery_id` identifies the current delivery. Delivery creation writes
both sides in one transaction. `POST /deliveries/{id}/rating` is customer
scoped: the caller must own the related order, it must be delivered, and the
existing uniqueness rule permits one rating per caller and delivery.

`GET /returns` applies `user_id = caller.id` before pagination. `reviewed` on
each order item is derived from the caller's existing ProductReview and is not
stored separately.

## Notification preferences

Preferences are stored once per user and shared by all devices. Missing rows
read as: order, delivery, return, and loyalty updates enabled; promotions
disabled. PATCH upserts supplied booleans and preserves omitted values. Device
tokens remain transport registrations and never store user preferences.
