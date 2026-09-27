<!-- Text companion of Shubayr Software Engineering Analysis v5.1. Same content as the DOCX/PDF; figures are referenced by caption and ship as files in Shubayr_Diagrams_v5.1. -->

SHUBAYR

شُبَيّر

Online Multi-Department Store — Mobile, Web Store & Web Admin

Software Engineering Analysis & System Design

وثيقة التحليل والتصميم الهندسي للنظام

| Project / المشروع | Shubayr Online Store |
|---|---|
| Document Type | Technical Analysis & Architecture Specification |
| Prepared for / أُعدّت لـ | Shubayr Development Team |
| Store Model | Single-owner, multi-department store (white-label) · Iraq · IQD |
| Client apps | Mobile: Flutter (iOS / Android) · Web store: Next.js · Web Admin: Next.js (admin subdomain) |
| Backend / API | NestJS + TypeScript + Prisma · PostgreSQL · Redis · Meilisearch · SeaweedFS (S3) |
| Version | 5.1 — approved modifications, team decisions, wage & netting policy, external-driver addendum, v5.0 review corrections |
| API contract | v5.5.0 live on main · v6.0.0 (breaking) planned with build phase 1 |
| Date | September 2026 |
| Status | Customer storefront live on real data · v5 scope approved · implementation starting at build phase 1 |

Confidential — engineering blueprint for the Shubayr project team. Where this version conflicts with an earlier one, this version wins.

# Table of Contents  ·  المحتويات

1. Executive Summary 3

2. Project Overview & Vision 4

3. Project Scope 5

4. Interfaces, Stakeholders & Roles 7

5. Functional Requirements 9

6. Non-Functional Requirements 11

7. Technology Stack 12

8. System Architecture 14

9. UML & System Diagrams 15

10. Access Control & Permissions 28

11. Order Lifecycle, Reservation & Fulfilment 30

12. Inventory, Lots & Costing 36

13. Purchasing, Suppliers & Currencies 41

14. Delivery Custody, Collections & External Drivers 45

15. Delivery Agent Wages & Netting 50

16. Returns, Discounts & Loyalty 54

17. Accounting Core: Ledger, Expenses & Period Close 57

18. Pricing Protection & Input Safeguards 60

19. Notifications 63

20. Reports & Settings 64

21. Database Design 66

22. API Design Overview 68

23. Security & Data Protection 70

24. Localization & RTL Support 71

25. Delivery Roadmap & Phases 72

26. Budget Baseline & Scope Impact 75

27. Team & Engineering Workflow 76

28. Risks & Mitigations 77

29. Acceptance Criteria 78

30. Current Build Status 80

31. Revision History & Decision Log 82

32. Appendix: Glossary 84

# 1. Executive Summary

الملخص التنفيذي

Shubayr is an online store built around the idea of a digital shopping mall: one business, trusted by its customers, selling across many departments — phones and accessories, laptops, home appliances, clothing, cosmetics, sports, electricals, and a nursing and medical-supplies section, with more departments added over time. The store operates in Iraq; its base currency is the Iraqi dinar (IQD) and its timezone is Asia/Baghdad.

Three client applications share one backend and one set of data: a Flutter mobile app (iOS and Android) for guests, customers, delivery agents and an order-monitoring admin; a Next.js web store for guests and customers (and the same work pages for agents and monitors); and a separate Next.js Web Admin, on its own subdomain, which is the only place where the store is actually managed.

Version 5.0 folds in four team-approved documents: the approved modifications, the team's answers to the eight open decisions, the delivery-agent wage and netting policy, and the external-driver addendum. Together they turn Shubayr from a store with basic stock handling into a store with a complete operational and financial trail:

- Strict interface split. Phones and the web store are customer apps or work apps — never admin consoles. Every real administrative action happens in the Web Admin, under fine-grained, per-action permissions enforced by the API.
- Inventory at lot level. Every purchase creates distinct stock lots with their own cost, dates and per-location balances. Stock is reserved against specific lots when an order is created, picked by FIFO or FEFO, and valued by moving weighted average cost.
- A complete money trail. Supplier accounts (cash, credit and partial payment, in IQD or enabled foreign currencies), delivery-party cash custody and numbered vouchers, agent wages and authorised netting, external drivers without app accounts, expenses, a unified double-entry ledger and a manual monthly close.
Customers pay by Cash on Delivery only in Release 1; the payment design stays pluggable so gateways can be added later. The customer-facing storefront is already live on real data; the v5 scope starts implementation with build phase 1 (access model).

Terminology used throughout: "Release 1" is the first operational release of the product — what the team documents call «المرحلة الأولى». "Phase 1 … Phase 13" are build phases (section 25): internal development steps, none of which is a production launch on its own. Stock is managed per SKU (a product variant); a product page can group several SKUs.

الملخص

«شُبَيّر» متجر إلكتروني بأقسام متعددة لعميل واحد في العراق (الدينار العراقي، توقيت بغداد). ثلاث واجهات على خادم واحد: تطبيق Flutter للهاتف (زائر، زبون، مندوب توصيل، إدارة لمتابعة الطلبات)، ومتجر ويب Next.js، ولوحة إدارة ويب Next.js مستقلة هي المكان الوحيد لتنفيذ العمليات الإدارية. يضم الإصدار 5.0 التعديلات المعتمدة وقرارات الفريق وسياسة أجور المندوب والمقاصة وملحق السائق الخارجي: فصل صارم للواجهات والصلاحيات، ومخزون على مستوى الدفعات مع FIFO/FEFO ومتوسط مرجح للكلفة، وسجل مالي كامل يشمل المورّدين والعهد والأجور والمصاريف والسجل المحاسبي والإقفال الشهري. الدفع للزبائن عند الاستلام فقط حاليًا.

# 2. Project Overview & Vision

نظرة عامة على المشروع والرؤية

## 2.1 Vision

Give customers in the local market the easiest trusted way to shop many departments from one branded store — on their phone or in a browser — while giving the owner full, auditable control over stock, cash and costs.

## 2.2 Business Objectives

- Unified storefront: One online presence covering every department of the business.
- Wider reach: Reach and sales beyond the physical shop through mobile and web.
- Operational control: Staff run orders, purchasing, stock, delivery and cash from one Web Admin, each person limited to the actions they are allowed.
- Financial accountability: Every unit of stock and every dinar can be traced from purchase to sale, custody, settlement and report.
- Future-proof: A foundation that scales to more departments, more warehouses, foreign-currency purchasing and online payments later.

## 2.3 Departments, Categories & Brands

The catalog has exactly two levels: a main department and its subcategories (for example Laptops → Gaming laptops). A third level is blocked in both the UI and the API. Brands (HP, Dell, Samsung…) are an independent entity: each product links to its subcategory and, separately, to its brand. Brands appear as a filter and an optional brands page — never as extra category levels.

| # | Department (English) | القسم (بالعربية) | Example subcategories |
|---|---|---|---|
| 1 | Phones & Accessories | تليفونات وإكسسوارات | Smartphones, chargers, cases, earphones |
| 2 | Laptops & Computers | لابتوبات وحواسيب | Laptops, monitors, keyboards, storage |
| 3 | Home & Appliances | أجهزة منزلية | Kitchen, cleaning, small appliances |
| 4 | Clothing & Fashion | ملابس وأزياء | Men, women, kids, footwear |
| 5 | Cosmetics & Beauty | كوزماتك ومستحضرات تجميل | Skincare, makeup, fragrance |
| 6 | Sports Equipment | أجهزة رياضية | Fitness gear, supplements, apparel |
| 7 | Electricals & Electronics | كهربائيات وإلكترونيات | Cables, lighting, small electronics |
| 8 | Nursing & Medical Supplies | قسم التمريض والمستلزمات الطبية | First aid, care supplies, devices |

Staff add departments and subcategories at any time without code changes. Existing deeper branches are reviewed before migration: nodes that are really brands become brands (keeping the product's correct subcategory), and the remaining products move to the right subcategory. Nothing is converted in bulk purely by depth.

# 3. Project Scope

نطاق المشروع

## 3.1 In Scope — Release 1 (first operational release)

- Flutter mobile app (iOS + Android) and Next.js web store for guests and customers, with work pages for delivery agents and order monitors.
- Next.js Web Admin (separate app, own subdomain) for all store management, with username/password login and per-action permissions.
- Phone OTP sign-in for the mobile app and web store; one role per phone, pre-set from the Web Admin for work accounts.
- Two-level catalog, brands, variants, media, search, availability labels (in stock / low stock / out of stock), reviews, wishlist.
- Server-priced cart, coupons, Cash-on-Delivery checkout with lot-level reservation, price-change acceptance and idempotent placement.
- Order lifecycle with a permission per transition, acceptance timeout in business hours, pick lists, handover to delivery custody, failed-delivery retry.
- Purchasing with mandatory supplier, units and pack conversion, landed cost, foreign-currency purchases, drafts, supplier accounts and payments.
- Inventory by warehouse, location and lot; FIFO/FEFO; transfers; stock counts; damaged stock; moving weighted-average costing.
- Delivery custody and cash collections for registered agents and external drivers (no app account), cash receipts, netting, agent wages and payroll statements.
- Customer returns with per-unit refund shares, loyalty points reversal, refund vouchers; supplier returns.
- Expenses, cash/bank accounts, unified double-entry ledger, correction documents, manual monthly close; reports and settings.
- Notifications with a saved inbox per recipient, synced read state across devices, live updates on the web; Arabic + English with full RTL.

## 3.2 Out of Scope (deferred)

- Online payment gateways for customers (the payment module stays pluggable).
- Price negotiation — removed from the product entirely (UI and API).
- Browser push notifications when the website is closed; a notification-template editor (fixed texts are used).
- Automatic market-price or exchange-rate feeds, per-lot selling prices, advanced pricing engines.
- Installment schedules, interest and automatic penalties on supplier debt; bank-feed integration; annual-close automation.
- Full HR/payroll (attendance, deductions) — only the delivery-agent wage policy is in scope; depreciation is declared as not computed.
- Best-seller and delivery-performance analytics (unless already committed); multi-vendor marketplace.

## 3.3 Assumptions

- One business owns all inventory, possibly across several warehouses it owns.
- Base currency IQD and timezone Asia/Baghdad, fixed once transactions exist.
- Deliveries are made by registered delivery agents or by external drivers recorded without an account.
- The client provides product data, images, branding, business hours, and an SMS/OTP provider account.
الملخص

يشمل النطاق تطبيق الهاتف ومتجر الويب ولوحة الإدارة، وتسجيل الدخول بالهاتف مع دور واحد لكل رقم، وكتالوجًا بمستويين وعلامات تجارية، وسلة وطلبًا بالدفع عند الاستلام مع حجز على مستوى الدفعة، ودورة طلب بصلاحية لكل انتقال، ومشتريات بمورّد إلزامي وعملات أجنبية، ومخزونًا بالدفعات والمواقع مع FIFO/FEFO والمتوسط المرجح، وعهد التوصيل للمندوبين والسائقين الخارجيين، والأجور والمقاصة، والمرتجعات، والمصاريف والسجل المحاسبي الموحد والإقفال الشهري والتقارير. خارج النطاق حاليًا: بوابات الدفع الإلكتروني، والتفاوض على الأسعار (أُلغي نهائيًا)، وإشعارات المتصفح عند إغلاق الموقع، والجلب الآلي لأسعار السوق والصرف.

# 4. Interfaces, Stakeholders & Roles

الواجهات والأطراف وأدوار المستخدمين

## 4.1 Client interfaces

| Interface | Technology | Who uses it | Sign-in |
|---|---|---|---|
| Mobile app | Flutter — iOS and Android only | Guest, customer, delivery agent, order monitor | Phone + OTP |
| Web store | Next.js (separate from admin) | Guest, customer; work pages for agent and monitor | Phone + OTP |
| Web Admin | Next.js app in admin/, own subdomain | Staff, each with assigned permissions | Username + password |
| Backend | NestJS REST API | All of the above — one set of accounts, orders, stock and permissions | — |

Flutter is used for the phone apps only; there is no Flutter Web. Sharing visual identity and behaviour between Flutter and Next.js does not mean porting components between them.

## 4.2 Roles

| Role | الدور | Where | What they can do |
|---|---|---|---|
| Guest | زائر | Mobile, web store | Browse, search, filter, view products, sign in. |
| Customer | زبون | Mobile, web store | Cart, wishlist, addresses, COD orders, tracking, cancel while pending, request cancellation after dispatch, reviews, returns, loyalty, notifications. |
| Delivery agent | مندوب توصيل | Mobile, web store (work pages) | Assigned orders and the details needed to deliver; start delivery, confirm delivery and amount collected, report failure; own statement read-only. Cannot shop. |
| Order monitor | إدارة لمتابعة الطلبات | Mobile, web store (work pages) | Read-only orders (chips, search, date range, pagination), order notifications. No edits of any kind. Cannot shop. |
| Web Admin staff | مستخدم لوحة الإدارة | Web Admin | Exactly the actions granted by permissions or presets — orders, catalog, prices, purchasing, stock, cash, returns, reports, settings. |
| Store owner | صاحب المتجر | Web Admin | Grants permissions and presets, registers work phones, closes periods, sees all reports. |
| External driver | سائق خارجي | No app account | A delivery party record only; staff record handover, delivery, collection and settlement on the driver's behalf. |

## 4.3 Binding rules

- Each phone number has exactly one role in the mobile app and the web store: customer, delivery agent, or order monitor. Work numbers and their roles are set in advance from the Web Admin; after OTP verification the server assigns the role — the user never chooses it.
- Work accounts cannot switch into customer or guest mode in the same session and cannot shop anywhere: shopping pages are hidden and every purchase function is refused by the API.
- Holding many permissions in the Web Admin never turns a phone session into an admin session; the monitor stays read-only and the agent stays within delivery tasks.
- Restrictions are enforced by the backend, not by hiding buttons.
الملخص

تطبيق الهاتف (Flutter لـ iOS وAndroid فقط) ومتجر الويب (Next.js) للزائر والزبون مع صفحات عمل للمندوب والإدارة لمتابعة الطلبات، وتسجيل الدخول فيهما برقم الهاتف والتحقق. لوحة الإدارة Web Admin تطبيق Next.js مستقل على نطاق فرعي، بدخول باسم مستخدم وكلمة مرور وصلاحيات لكل إجراء. لكل رقم هاتف دور واحد يحدده الخادم من السجل المعدّ مسبقًا، وحسابات العمل لا تستطيع الشراء، وجلسة المتابعة للقراءة فقط، وتُفرض القيود في الخادم لا بإخفاء الأزرار. السائق الخارجي سجل جهة توصيل بلا حساب، ويسجل الموظف الإجراءات نيابةً عنه.

# 5. Functional Requirements

المتطلبات الوظيفية

Requirements grouped by module. Each row is a capability the delivered system must provide; detailed rules live in sections 10–20.

| ID | Module | Requirement |
|---|---|---|
| FR-1 | Access | Phone OTP for app surfaces; username/password for Web Admin; one role per phone; per-action permissions and presets applied immediately; separation of duties; audit of every change. |
| FR-2 | Catalog | Two-level categories, brands, products, variants, ordered media, bilingual names, publish rules (approved price and reliable cost required). |
| FR-3 | Pricing | One base selling price per product; fixed local price or price linked to a foreign reference; rounding rule; versioned batch publish; scheduled discounts. |
| FR-4 | Availability | Per SKU: in stock / low stock (available > 0 and ≤ threshold, store default + per-SKU override) / out of stock, computed from sellable available quantity; same rule on mobile and web. |
| FR-5 | Cart & checkout | Server-priced cart; coupons; price-change acceptance; COD; atomic, concurrency-safe, idempotent order creation with lot-level reservation. |
| FR-6 | Order lifecycle | Pending → confirmed → preparing → ready → dispatched → delivered, with rejected, cancelled, failed and retry; a permission per transition; acceptance timeout; cancellation rules. |
| FR-7 | Fulfilment | FIFO/FEFO allocation, pick lists with lot/warehouse/location/quantity, re-check and reallocation at preparation, handover into delivery custody. |
| FR-8 | Inventory | Per SKU: warehouses and location codes, lots with per-location balances, exact decimal quantities in the SKU's base unit, movement ledger, transfers, stock counts, damaged/expired stock, no negative stock. |
| FR-9 | Costing | Moving weighted-average cost per SKU across warehouses, landed cost allocation, fixed issue cost, custody valuation, cost corrections across warehouse, custody and sold quantities. |
| FR-10 | Purchasing & suppliers | Single purchase screen with mandatory supplier, default and per-row locations, pack conversion, drafts, atomic posting; supplier invoices, payments, allocations, credits, FX differences, supplier returns. |
| FR-11 | Currencies | Base IQD, enabled foreign currencies, manual central exchange rates with history, per-document transaction rates. |
| FR-12 | Delivery custody | Goods and cash custody per delivery party, collections, collection exceptions, cash receipts with allocation, unallocated receipts, reversals, custody transfers. |
| FR-13 | External drivers | Driver records without accounts, numbered trips, fare agreements (store- or customer-paid), staff-recorded events, settlement and netting. |
| FR-14 | Wages & netting | Versioned salary / per-delivery wage settings, accruals, monthly payroll statements, advances, payments and authorised netting against collections. |
| FR-15 | Returns & loyalty | Partial returns with per-unit shares, separate receive/inspect/approve/pay states, delivery-fee policy, points reversal and restoration. |
| FR-16 | Accounting | Unified double-entry ledger, cash/bank accounts, expenses, owner drawings and transfers, correction documents, manual monthly close and reopen. |
| FR-17 | Safeguards | Below-cost protection with scoped exceptions, markup alerts, unusual-change review, date windows, strict numeric input rules. |
| FR-18 | Notifications | One saved notification per recipient, push + web inbox with live updates, synced read state, role-aware deep links, preferences. |
| FR-19 | Reports | Sales, purchases, returns, stock, low stock and expiry, counts, supplier statements and aging, delivery custody, wages, profitability, cash, liabilities, expenses. |
| FR-20 | Localization | Arabic-first bilingual UI, RTL, ISO-coded currency formatting, Arabic and English numerals, store timezone. |

# 6. Non-Functional Requirements

المتطلبات غير الوظيفية

| Attribute | Target / approach |
|---|---|
| Correctness of money | Exact decimal arithmetic for amounts, costs and exchange rates; fractions of unit cost kept internally; no cumulative rounding of the average; totals always equal the sum of their parts. |
| Concurrency & idempotency | Every stock, cash and document operation is atomic, protected against simultaneous users, and safe to retry (operation or idempotency key). A lost response is resolved by querying the operation, never by re-posting. |
| Immutability & audit | Posted documents and movements are never edited or deleted; errors are fixed by linked reversal or correction documents. Every sensitive action records actor, time, reason and before/after. |
| Performance | API p95 < 300 ms for common reads; listing < 2 s on 4G; server-side search, filters and pagination; CDN and image optimisation. |
| Scalability | Stateless API behind a load balancer; Redis cache and pub/sub; queue workers for slow work. |
| Availability | Target 99.5%; daily database backups with restore tests; health checks and auto-restart. |
| Security | TLS, argon2id passwords, hashed OTP, rate limiting and lockout, deny-by-default authorization, least privilege, OWASP Top-10 hardening. |
| Usability | Arabic-first; clear messages next to the field that explain the fix; inputs kept on error; no backend or database errors shown to staff or customers. |
| Consistency of behaviour | Flutter keeps its current pagination (load more) and chips behaviour; similar screens reuse the same components and interaction style. |
| Compatibility | Android 8.0+, iOS 15+, current Chrome / Safari / Edge / Firefox. |
| Maintainability | Modular NestJS monolith, typed OpenAPI contract as the single source of truth, migrations with drift checks, automated tests. |
| Observability | Structured logs, error tracking, uptime and performance monitoring, reconciliation reports for stock and money. |

الملخص

تتطلب الأنظمة المالية والمخزنية دقة عشرية كاملة، وعمليات ذرية محمية من التزامن ومن التكرار عند إعادة الإرسال، وعدم تعديل أو حذف المستندات المرحّلة بل عكسها بسندات مرتبطة، وسجل تدقيق لكل إجراء حساس. إلى جانب ذلك: الأداء، وقابلية التوسع، والتوفر 99.5%، والأمان (كلمات مرور argon2id، وقفل الحساب، ومنع افتراضي لكل مسار غير مصرح)، ورسائل واضحة بجانب الحقل، والحفاظ على سلوك Pagination وChips الحالي في Flutter.

# 7. Technology Stack

المكدّس التقني

## 7.1 Stack overview

| Layer | Technology | Why |
|---|---|---|
| Mobile app | Flutter (Dart), iOS + Android | One codebase, strong Arabic/RTL support, near-native performance. |
| Web store | Next.js (React, App Router, TypeScript) | Server-side rendering for SEO and fast first load; next-intl for Arabic/English. |
| Web Admin | Next.js — separate app in admin/, own subdomain | Data-heavy staff screens, typed API client and Playwright tests shared with the web store; isolated from the customer bundle. |
| Backend / API | NestJS + TypeScript + Prisma | Typed modular backend; real versioned migrations; one REST/JSON contract (OpenAPI). |
| Database | PostgreSQL | Transactions, row locking and constraints for stock and money. |
| Cache, queues, realtime | Redis + BullMQ; Server-Sent Events | Cache, background jobs, acceptance timers, live notification updates. |
| Search | Meilisearch | Fast, typo-tolerant Arabic/English search. |
| Object storage | SeaweedFS (S3-compatible) | Replaced the gated MinIO image (PR #54); durable media, same S3 contract. |
| Push / SMS | Firebase Cloud Messaging · local SMS gateway | Push to phones; OTP and mandatory SMS (dev OTP mode in development). |
| Auth | JWT access + refresh, surface-bound | Phone OTP on the app surface; username/password on the admin surface. |
| Infrastructure | Docker Compose on VPS / cloud; Nginx + TLS | One-command stack; low running cost. |
| CI/CD | GitHub Actions | OpenAPI lint, schema drift check, unit tests, real-database acceptance on a throwaway DB, web live and mock suites. |

## 7.2 Architecture style

A modular monolith: one NestJS backend with clear domain modules (access, catalog, cart/checkout, orders and fulfilment, inventory and costing, purchasing and suppliers, custody and collections, wages, returns, loyalty/reviews/wishlist, notifications, reports) on top of a shared accounting core (ledger, currencies, expenses, periods). All clients talk only to the API; the API owns every business rule.

## 7.3 Payment design

Customers pay by Cash on Delivery only. Checkout depends on a payment-method interface, so gateways (ZainCash, FastPay, Qi Card, cards) are new implementations later; their pending/failed/expired rules will be defined when a gateway is integrated. Supplier purchases support cash, credit and partial payment (section 13).

الملخص

Flutter لتطبيق الهاتف فقط، وNext.js لمتجر الويب، وتطبيق Next.js مستقل للوحة الإدارة على نطاق فرعي، وخلفية NestJS + TypeScript + Prisma مع PostgreSQL وRedis وMeilisearch وتخزين SeaweedFS المتوافق مع S3 (بدل MinIO). المعمارية مونوليث معياري بوحدات واضحة فوق نواة محاسبية مشتركة. الدفع للزبائن عند الاستلام بتصميم قابل للتوسعة، ومشتريات المورّدين نقدية أو آجلة أو مسددة جزئيًا.

# 8. System Architecture

معمارية النظام

Client apps talk only to the API. A deny-by-default policy guard checks every request for its surface (admin or app), the caller's role, and the specific permission. Domain modules post every stock and money effect through the accounting core. Slow work (push, SMS, acceptance timers) runs in queue workers; live web updates are pushed with Server-Sent Events.

Figure 1. High-level system architecture.

الشكل 1: المعمارية العامة للنظام.

# 9. UML & System Diagrams

مخططات UML ومخططات النظام

This section holds the system-wide diagrams. Domain-specific diagrams (order state machine, fulfilment, allocation, purchase posting, custody and netting, external trips, returns) appear in their own sections. Editable Mermaid sources, PNG and SVG files ship in the accompanying diagrams folder.

## 9.1 Use Case Diagram

Actors and what each can do. Customer-side use cases are on the left; Web Admin use cases on the right. The external driver has no account: staff record trip events on the driver's behalf (dotted link).

Figure 2. Use case diagram — actors and their use cases.

الشكل 2: مخطط حالات الاستخدام — الفاعلون وحالات الاستخدام.

## 9.2 Class Diagram — Commerce

The main commerce classes and their relationships. Order status, collection status and settlement status are separate attributes; order items keep per-unit discount and points shares for later returns.

Figure 3. Class diagram — commerce domain.

الشكل 3: مخطط الأصناف — نطاق التجارة.

## 9.3 Entity-Relationship Views

The data model is presented in four linked views; the wide ones are printed on landscape pages. Table and column names are indicative of the Prisma schema; exact names follow the migrations. The stock item is the SKU (product variant): lots, balances, reservations, movements and average cost are all keyed by variant. Quantities are exact decimals in the SKU's base unit. For full detail use the SVG files in the diagrams folder.

Figure 4. ER view A — accounts and access, catalog, cart, orders, reviews, loyalty, notifications.

الشكل 4: مخطط الكيانات (أ) — الحسابات والصلاحيات، الكتالوج، السلة، الطلبات، التقييمات، الولاء، الإشعارات.

Figure 5. ER view B — warehouses, locations, lots, balances, movements, reservations, custody, costing, returns.

الشكل 5: مخطط الكيانات (ب) — المخازن والمواقع والدفعات والأرصدة والحركات والحجوزات والعهدة والكلفة والمرتجعات.

Figure 6. ER view C — suppliers, purchase documents and lines, invoices, payments and allocations, currencies and rates.

الشكل 6: مخطط الكيانات (ج) — المورّدون ومستندات الشراء والفواتير والدفعات والتخصيصات والعملات وأسعار الصرف.

Figure 7. ER view D — ledger, periods, delivery parties, collections, receipts, wages, netting, trips, expenses.

الشكل 7: مخطط الكيانات (د) — السجل المحاسبي والفترات وجهات التوصيل والتحصيلات والسندات والأجور والمقاصة والرحلات والمصاريف.

## 9.4 Sequence — Checkout (Cash on Delivery)

Order placement: work accounts are refused, a repeated idempotency key returns the same order, a price change requires the customer's acceptance, and stock is reserved per lot inside one transaction — either the whole order and all its reservations are created, or nothing is.

Figure 8. Sequence — placing a COD order with lot-level reservation.

الشكل 8: مخطط التتابع — إنشاء طلب بالدفع عند الاستلام مع الحجز على مستوى الدفعة.

## 9.5 Sequence — Sign-in (phone OTP and admin password)

Figure 9. Sequence — OTP sign-in with server-assigned role, and Web Admin password login.

الشكل 9: مخطط التتابع — الدخول برمز التحقق مع دور يحدده الخادم، ودخول لوحة الإدارة بكلمة المرور.

## 9.6 Activity — From browsing to a placed order

Figure 10. Activity — shopping to order.

الشكل 10: مخطط النشاط — من التصفح إلى إنشاء الطلب.

## 9.7 Component Diagram

Figure 11. Component diagram — presentation, API layer, domain modules, accounting core, infrastructure.

الشكل 11: مخطط المكوّنات — الواجهات وطبقة الـ API ووحدات النطاق والنواة المحاسبية والبنية التحتية.

## 9.8 Deployment Diagram

Figure 12. Deployment diagram — runtime infrastructure.

الشكل 12: مخطط النشر — البنية التحتية لوقت التشغيل.

# 10. Access Control & Permissions

التحكم بالوصول والصلاحيات

## 10.1 Surfaces

Every token carries a surface. The admin surface is reached only through the Web Admin's username/password login. The app surface is reached through phone OTP from the mobile app or the web store (a client claim records which). Every mutating administrative endpoint requires the admin surface plus its specific permission; an app session can never perform it, whatever permissions the same person holds in the Web Admin.

| Caller | Surface | Allowed |
|---|---|---|
| Guest | none | Public catalog, banners, brands, sign-in. |
| Customer | app | Own cart, checkout, orders, addresses, wishlist, reviews, returns, loyalty, notifications, profile. |
| Delivery agent | app | Own assigned deliveries and the allowed delivery transitions; own statement read-only; notifications. Every purchase function is refused. |
| Order monitor | app | Read-only order list and detail; notifications. Every write and every purchase function is refused. |
| Staff | admin | Exactly the endpoints matching the staff member's current permissions. |

## 10.2 Phone roles

- An unknown phone registers as a customer. A phone becomes a delivery agent or order monitor only if it was registered with that role in the Web Admin; any role sent by a client is ignored.
- A phone already belonging to a customer account cannot be registered as a work phone (default rule; the owner uses a different number).
- Registering, changing or revoking a work phone is audited and takes effect immediately: existing sessions of that phone stop working on the next request.
- After sign-in, work accounts see only work pages; shopping, cart, wishlist, customer addresses and any purchase function are hidden in the apps and refused by the API.

## 10.3 Staff accounts, permissions and presets

Staff accounts are created by a user holding the user-management permission (no self-signup). Passwords are hashed with argon2id, logins are rate-limited with lockout after repeated failures, and a reset password must be changed at the next login. Permissions are per action and are grouped into presets that the owner assigns — one or several per user — plus individual extra grants.

| Area | Example permission keys (indicative) |
|---|---|
| Orders | orders.view · accept · reject · prepare · mark_ready · handover · cancel · assign_agent · extend_timeout |
| Catalog & prices | catalog.categories · catalog.brands · catalog.products · prices.change · prices.publish_linked · discounts.manage · sell_below_cost.approve |
| Cost & suppliers | cost.view · suppliers.view · suppliers.manage · purchases.create · purchases.correct · supplier_payments.record · supplier_payments.reverse |
| Inventory | inventory.count · inventory.transfer · inventory.adjust · inventory.write_down · inventory.correct_cost |
| Delivery & cash | deliveries.manage · drivers.manage · trips.manage · custody.receive_cash · netting.perform · netting.reverse |
| Wages | wages.configure · payroll.approve · wages.pay · wages.adjust |
| Returns & loyalty | returns.inspect · returns.approve · refunds.pay · loyalty.adjust · reviews.moderate |
| Finance | expenses.enter · expenses.approve · expenses.pay · cash_accounts.manage · fx_rates.update · period.close · period.reopen · backdate.approve |
| Administration | users.manage · presets.manage · work_phones.manage · settings.manage · reports.view.* |

## 10.4 Enforcement rules

- Immediate effect: every request reads the user's current permissions (cached by a per-user permission version), so a grant or revoke applies to the very next request without re-login; deactivation revokes sessions at once.
- Deny by default: every route declares its policy (public, app role, or admin surface + permission). A CI test enumerates all routes and fails the build if any route has no policy, and an authorization-matrix test checks every route against every caller type.
- Separation of duties: no user approves a financial action in their own favour or receives a payment coming out of their own custody; a reusable check enforces this across modules.
- Scope: a permission allows an action only when the entity's state and conditions allow it — it never skips a step (for example, handing over goods that were not prepared).
- Audit: every permission, preset, work-phone and staff-account change is logged with actor, time and reason.
الملخص

لكل جلسة «سطح»: سطح الإدارة عبر اسم المستخدم وكلمة المرور في Web Admin فقط، وسطح التطبيق عبر رمز التحقق من الهاتف أو متجر الويب. أي عملية إدارية تتطلب سطح الإدارة مع صلاحيتها المحددة، ولا تنفذها جلسة التطبيق مهما كانت صلاحيات الشخص نفسه. الرقم المجهول يُسجَّل زبونًا، وأرقام العمل تُسجل مسبقًا من اللوحة، ولا يمكن تسجيل رقم زبون كرقم عمل. الصلاحيات لكل إجراء وتُجمع في مجموعات جاهزة، وتسري فورًا دون إعادة دخول، مع منع افتراضي لكل مسار غير مُعرَّف، ومنع اعتماد المستخدم لعملية مالية لصالحه، وسجل تدقيق كامل.

# 11. Order Lifecycle, Reservation & Fulfilment

دورة الطلب والحجز والتجهيز

## 11.1 Statuses

One transition table lives on the server. Current status names are kept where they carry the same meaning. The main path is pending → confirmed → preparing → ready_for_dispatch → dispatched (out for delivery) → delivered. Branches: rejected or cancelled before dispatch; failed after dispatch (retried while the goods stay in custody, or sent back to ready_for_dispatch once the goods are physically received back); and cancelled after dispatch, which opens a separate retrieval document (11.6). Retrieval and customer returns are documents linked to the order, not order statuses; a customer return never moves the order's status backwards. Fulfilment status, customer collection status, delivery-party settlement status and return status are stored separately and shown with clear labels.

Figure 13. State machine — order lifecycle.

الشكل 13: مخطط الحالات — دورة حياة الطلب.

## 11.2 Transitions and their effects

The performer is whoever holds the permission the owner assigned; job titles grant nothing automatically.

| Transition | Allowed performer | Stock & custody effect | Money effect |
|---|---|---|---|
| Create → pending | Customer and server | Reserve lots and locations; no goods leave | Price fixed; nothing collected |
| pending → confirmed | Staff with accept permission | Reservation continues | None |
| confirmed → preparing → ready | Staff with each action's permission | Lots re-checked and picked; still reserved in the warehouse | None |
| ready → dispatched | Staff authorised to hand over, or the assigned agent after documented handover | Goods leave the location into the party's custody at a fixed cost; reservation settled once | Amount expected to be collected; not yet collected |
| dispatched → delivered | Assigned agent with permission, or staff with documentation | Custody of the goods ends at the customer | Actual collected amount recorded; party's cash custody increases; no automatic settlement with the store |
| dispatched → failed | Assigned agent or staff | Goods stay in the party's custody | No assumed collection; any real collection is kept |
| failed → retry | Staff, or the agent if granted | Same goods, same custody, no new issue | No duplicate collection |
| Before dispatch → rejected / cancelled | Staff; customer while pending; server if auto-cancel is enabled | Reservation released only | No collection or refund assumed |
| dispatched or failed → cancelled (after dispatch) | Staff with the cancel-after-dispatch permission; the customer can only request it | Goods stay in the party's custody; a retrieval document opens and custody stays open until it closes | Any collection or refund handled by separate documents |
| failed → ready_for_dispatch | Staff receiving the goods back through a retrieval document | Goods back to a location at their fixed issue cost and re-reserved for the same order; the next handover is a new issue | None |
| delivered → partial / full return | Staff authorised to approve and receive returns | Only quantities actually received come back | Refund entitlement then refund payment; earlier collection and settlement untouched |

## 11.3 Reservation and concurrency

- Stock is reserved automatically when an order is successfully created — not when an item is added to the cart. The reservation names the lot and the storage location and lowers the quantity available for sale without being an issue of goods.
- The server checks every line and creates the order and its reservations in one transaction protected against simultaneous orders: either everything succeeds or no order and no partial reservation exist. Re-sending the same request never creates a second order or reservation.
- Mandatory acceptance example: 5 units available, two customers each order 3 at the same moment. The order whose reservation commits first on the server succeeds and 2 units remain; the device's tap time plays no role.
- The other checkout stops with a clear message, e.g. "The available quantity of this product changed; 2 are now available instead of 3. Please adjust the quantity to complete the order." The affected item is identified, the cart and all inputs are kept, no backend error is shown, and the quantity is never changed without the customer's choice.
- If a price changed after the customer viewed the cart, the new total is shown and the customer must accept it before the order and reservations are created. A created order keeps its price and discounts even if prices change later.

## 11.4 Acceptance timeout and cancellation rules

- Business hours, closed days, timezone (default Asia/Baghdad) and the acceptance timeout come from store settings. The timeout counts business hours only; orders placed while closed start counting when the next shift begins. Each order stores its own deadline at creation; a settings change never silently recalculates existing orders, and any explicit extension needs permission and a reason.
- Default when the timeout passes: the order is marked "late for acceptance" and the authorised person is alerted; the order is not cancelled, its price is unchanged, its reservation stays, and its age is shown in the late-orders list. Alerts are not repeated without limit.
- The owner may enable automatic cancellation with its own timeout (no default value) and a configurable warning before it. When it fires, an order still pending is cancelled and its reservations released once, and the customer and admins are notified. Acceptance and auto-cancellation racing each other can never both succeed. Confirmed orders are not subject to the timeout.
- The customer can cancel directly while the order is pending. After dispatch the customer can only send a cancellation request to the admin. Cancelling a confirmed order before dispatch needs an admin permission, a reason and a notification.

## 11.5 Fulfilment and handover

Figure 14. Sequence — acceptance, preparation, handover and delivery.

الشكل 14: مخطط التتابع — القبول والتجهيز والتسليم للمندوب والتوصيل.

- Until ready, goods stay reserved in the warehouse. The move to dispatched is tied to the physical handover to the assigned agent or driver: it records the goods leaving the location, settles the reservation and moves the quantity into the party's custody once, at a fixed issue cost.
- Goods in delivery custody are a tracked asset, not sellable and not a completed sale, until they are delivered or brought back.
- The agent can be given permission to start delivery (only when the order is ready and the handover is documented) and to confirm delivery or failure for their own assigned orders. The system shows the amount to collect and the agent records the amount actually collected.
- There is no partial delivery in Release 1 and no conversion of a shortfall into customer credit: a shortfall after a real delivery is raised as a collection exception for the admin, never recorded as full payment.
- A failed delivery requires a reason and keeps the goods in custody; retrying does not deduct stock again. Re-assigning an order to another party does not move goods or historical cash; an actual transfer of custody between parties needs a voucher accepted by the receiver and approved by an authorised user.
- The server applies each transition with its stock and money effects together, checks the latest state to stop two users colliding, and never repeats an effect when a request is re-sent.

## 11.6 Retrieval after dispatch

A retrieval document tracks goods that left the warehouse but must come back without being delivered. It opens automatically when a cancellation after dispatch is approved, or when staff record goods coming back after a failed delivery. It is not an order status: the order shows cancelled (or ready_for_dispatch again), and a clear "retrieval open" marker stays on the order and the party's custody until the document closes.

Figure 15. State machine — retrieval document.

الشكل 15: مخطط الحالات — مستند الاسترجاع.

| State / step | Allowed performer | Effect |
|---|---|---|
| open | Server, on approved cancellation after dispatch or recorded return after failure | Lists every line and quantity still in the party's custody; notifies authorised staff. |
| partially_received / received | Staff with retrieval-receive permission | Each received quantity moves from custody into an inspection location at its fixed issue cost; the rest stays in custody. |
| inspected | Staff with retrieval-inspect permission | Sellable quantity goes to a chosen location (for a failed-delivery return it is re-reserved for the same order); damaged quantity goes to an isolated location pending write-down. |
| exception_review | Staff with exception-approval permission | Missing, lost or disputed quantity is recorded as a custody exception with documents; nothing is charged to the delivery party automatically. |
| closed | Staff with retrieval-close permission | Allowed only when every quantity is received, restocked, isolated or approved as a loss. Only then does the order's goods custody close. |

Partial receipt is normal: custody is reduced only by what actually came back. Cash collected before a cancellation (rare) and any refund are handled by separate vouchers. Notifications: authorised staff when a retrieval opens and when it closes with exceptions; the customer receives the order-cancelled notice.

الملخص

المسار الأساسي: بانتظار القبول ← مؤكد ← قيد التجهيز ← جاهز للتوصيل ← قيد التوصيل ← تم التوصيل، مع الرفض أو الإلغاء قبل الخروج، وتعذر التوصيل بعد الخروج مع إعادة المحاولة. لكل انتقال صلاحية مستقلة. يُحجز المخزون على مستوى الدفعة والموقع عند نجاح إنشاء الطلب في عملية واحدة محمية من التزامن (مثال: المتاح 5 وطلبان بثلاث قطع، ينجح الأسبق تثبيتًا على الخادم ويبقى 2 مع رسالة واضحة للآخر دون فقد السلة). مهلة القبول تحتسب في ساعات العمل فقط، والافتراضي عند انتهائها تمييز الطلب «متأخر عن القبول» مع تنبيه، والإلغاء الآلي اختياري. الانتقال إلى «قيد التوصيل» هو التسليم الفعلي للعهدة بكلفة مثبتة، والتعذر يبقي البضاعة بعهدة المندوب، والنقص في التحصيل استثناء للإدارة.

# 12. Inventory, Lots & Costing

المخزون والدفعات والكلفة

## 12.1 Warehouses, locations and lots

- The stock item is the SKU — a product variant with identical specifications (e.g. a phone in 128GB and in 256GB are two SKUs even on one product page). Lots, balances, reservations, movements, availability, low-stock thresholds and average cost are all kept per SKU; different variants are never pooled into one balance or one cost.
- Quantities are exact decimals in each SKU's base unit (piece, kg, litre…), stored with three decimal places. SKUs sold by the piece accept whole numbers only; fractional quantities are allowed only for SKUs managed by weight or volume. The same representation is used in purchases, carts, orders, reservations, movements, custody and returns.
- A storage place is a warehouse plus a registered location code inside it, with an optional description; users pick locations from a list. There is no mandatory zone/aisle/shelf/bin structure.
- Every saved purchase line automatically creates a stock lot — no extra step. Each lot stays distinct even when it matches earlier lots, and records: product/variant, purchase reference, receipt date, quantity, purchase cost plus its share of landed costs, expiry date if any, and its balance in each warehouse and location separately.
- Repeat purchases of the same SKU add new lots to that SKU; a different purchase cost never creates a duplicate product or SKU and never overwrites the cost of earlier lots.
- Every receipt, reservation, release, issue, return, transfer and adjustment is recorded as a movement at lot and location level. Negative stock and double issues are impossible. Movements are never deleted to hide their effect.
- An internal transfer keeps the lot's identity, receipt date and expiry, and does not change the store's total quantity or value — it is not a new purchase.
Figure 16. Class diagram — inventory, lots, custody and costing.

الشكل 16: مخطط الأصناف — المخزون والدفعات والعهدة والكلفة.

## 12.2 Picking order: FIFO and FEFO

- Items without expiry: FIFO — the oldest received lot first.
- Items with expiry: FEFO — the nearest expiry first; when expiries are equal, the oldest received first.
- Expired, damaged or otherwise non-issuable quantities are always excluded.
- Quantity and expiry are re-checked at preparation and at handover. If a reserved lot can no longer be used, the reservation moves automatically to a valid lot of the same SKU, unit and required specifications — never to another variant — (FIFO/FEFO, within warehouses that can serve the order) without changing the order price or duplicating the reservation. If no valid quantity is left, preparation stops with a clear alert for the admin and a notice to the customer; no substitute product or reduced quantity is sent without the customer's consent.
- The preparer sees in the Web Admin the lot, warehouse, location and quantity to pick for each line.
Figure 17. Sequence — allocation at order creation, re-check and reallocation at preparation, issue at handover.

الشكل 17: مخطط التتابع — التخصيص عند إنشاء الطلب وإعادة الفحص عند التجهيز والصرف عند التسليم.

## 12.3 Availability shown to customers

Availability is computed per SKU from the quantity available for sale — excluding reserved, expired and non-issuable stock — with the same rule on mobile and web. Each SKU has a low-stock alert threshold expressed in its base unit (not a percentage); the store default comes from settings and can be overridden per SKU.

| Available quantity | Label |
|---|---|
| 0 | Out of stock — «غير متوفر في المخزون» |
| Greater than 0 and ≤ threshold | Low stock — «مخزون منخفض» (covers fractions such as 0.5 kg) |
| Above threshold | In stock — «متوفر في المخزون» |

Low stock never blocks a sale while the requested quantity is available; the check at order creation is always repeated even if the product page showed availability moments earlier.

## 12.4 Stock counts, damage and expiry

- A simple count by warehouse, location and product/lot records system quantity, counted quantity, difference, reason and performer. Approving a difference (with permission) posts a quantity-and-value adjustment; old purchase documents are never edited. A count cannot be settled from a stale screen if movements happened after counting.
- Damaged or expired stock moves to a non-sellable state or location, with a separate write-down or destruction movement when approved. Hiding a product from customers is not enough to treat its quantity and cost.
- If a shortage or damage touches reserved quantity, the affected reservations are handled and the orders are flagged — no phantom reservation or negative balance remains.

## 12.5 Costing: moving weighted average

Inventory is valued with the moving weighted-average cost per SKU (a homogeneous, interchangeable stock item), across all warehouses the store owns. Variants with different capacity, size or specifications each keep their own balance, average and reference cost — buying one never changes the cost of the other. Each lot's historical cost is kept for traceability but is never used in place of the average in cost reports. FIFO/FEFO decides which lot is physically picked; the average decides the value — the two are complementary, not alternatives.

| Rule | Detail |
|---|---|
| On purchase | New average = (current book value + net cost of the incoming quantity) ÷ (current book quantity + incoming quantity). Values are in IQD after conversion at the fixed transaction rate. Book quantity includes reserved stock. Net cost = after purchase discount, plus the allocated landed costs. |
| Reserve / release | No change to total value or to the average. |
| Issue | Cost fixed at the moment of the movement; past cost of sales is never recalculated with today's average. |
| Delivery custody | Goods issued to a delivery party leave the warehouse average and appear as a separate line within owned goods. On delivery the custody value becomes cost of goods sold without a second stock deduction; goods returned undelivered come back at their fixed issue cost and update the average. |
| Customer return | Returns at the cost fixed when the goods were issued — not today's purchase cost or the selling price; the average is updated from total value and quantity after the return. |
| Supplier return | Reduces quantity and value at the average cost at the time of return; the difference to the supplier's refund is a separate adjustment. |
| Method changes | The valuation method is not a daily option. A future change needs a planned migration and balance reconciliation. Existing stock migrated at go-live needs reconciled opening quantities and values — never an assumed zero cost. |

Acceptance examples: (1) a 128GB and a 256GB variant bought at different costs keep separate averages, and when the requested variant runs out the other is never reserved automatically. (2) 10 units at 10,000 IQD, then 10 units at 12,000 IQD, no movements between → 20 units, value 220,000, average 11,000. Issuing 3 units fixes a cost of 33,000 and leaves 17 units worth 187,000; the original lot costs stay on record.

الملخص

المخزن + رمز موقع مسجل داخله دون هيكل ممرات ورفوف إلزامي. كل بند شراء ينشئ دفعة مستقلة آليًا بتاريخ استلامها وكلفتها وصلاحيتها ورصيدها في كل موقع. تُسجل كل حركة على مستوى الدفعة والموقع، ويُمنع الرصيد السالب، والنقل يحفظ هوية الدفعة. السحب FIFO للمواد دون صلاحية وFEFO لذات الصلاحية مع إعادة فحص عند التجهيز والتسليم ونقل الحجز لدفعة صالحة دون تغيير السعر. حالة التوفر ثلاثية بحد تنبيه بالوحدات. التقييم بالمتوسط المرجح المتحرك لكل منتج (مثال: 10×10,000 ثم 10×12,000 = متوسط 11,000، وصرف 3 قطع = 33,000)، وFIFO/FEFO يحددان الدفعة المسحوبة لا الكلفة.

# 13. Purchasing, Suppliers & Currencies

المشتريات والمورّدون والعملات

One simple Web Admin screen records goods that have actually arrived, in IQD or in an enabled foreign currency. There is no separate receiving or routine approval step: "Save and add to stock" is the single posting point.

## 13.1 Purchase list fields

| Part | Fields and rules |
|---|---|
| Header | Automatic internal number; purchase/receipt date; supplier — mandatory, with quick-create by name; optional supplier invoice number (warning if it repeats for the same supplier); general notes. |
| Default location | "Default warehouse" and "default location in the warehouse" at the top. Every new row follows them and shows "per list settings". |
| Payment section | Amount paid now, payment method and cash/bank account when something is paid, and an optional agreed due date for the remainder. Fully paid = cash purchase; nothing paid on a positive invoice = credit purchase; in between = partially paid. The state is computed from documents, never from a "paid" checkbox. A zero-value approved invoice creates no debt and no phantom payment. |
| Currency | One currency per list, IQD by default. A foreign currency shows its rate and date and the IQD equivalent. The original amount, currency, transaction rate and IQD value are stored with the document and its payments. |
| Each line | SKU (product variant) or barcode, quantity, unit of measure, unit cost, discount if any, computed total, warehouse, location, optional notes, and expiry date for products that need one. An unknown cost is never saved as zero; free supply is an exception with permission and a recorded reason. |
| Units | Quantities are stored as exact decimals in the SKU's base unit. Piece SKUs take positive whole numbers. If a SKU is bought in packs and stocked in pieces, the conversion is shown explicitly (3 cartons × 12 = 36 pieces), the carton cost is converted to piece cost, and the factor is stored with the movement; changing it later never alters old movements. Fractional quantities (up to 3 decimals) only for SKUs managed by weight or volume, e.g. 2.5 kg. |
| Landed costs | One optional field for costs needed to bring the goods into the warehouse (e.g. transport). Allocated by default in proportion to each line's net value after discount, shown before saving; if all lines are zero the user allocates explicitly. Marked as IQD or list currency; converted once, then allocated in IQD. General operating expenses are not capitalised here. |

## 13.2 Default and per-row locations

- Any row can override its warehouse and location and then shows "custom for this row"; its quantity goes directly to that place on save, while other rows keep following the list settings. Changing a row's warehouse requires choosing a location of the new warehouse. Each overridden row has "use list settings" to return to the default.
- Changing the list's default warehouse or location before saving updates only the rows that follow the list. Changing the default warehouse clears the old default location and requires a valid location in the new warehouse before saving.
- On save, the destination of every quantity is fixed inside the lots and movements; later changes to list settings never move past stock. Moving goods that are already saved needs a documented stock transfer.
- A single line can be split across several locations; the split must equal the line quantity and each location must belong to the chosen warehouse.
Acceptance example: the list default is "Warehouse A / A-01" with five items. Overriding the third item to "Warehouse B / B-02" adds only that item to B and the rest to A. If the default location changes to A-03 before saving, the four following items move to A-03 and the third stays in B-02.

## 13.3 Posting, drafts and corrections

- The screen shows a summary of quantities and amounts before "Save and add to stock". Saving posts the list, its lots, movements, supplier invoice, any payment and the journal entry as one operation protected against concurrency and re-submission, then updates the quantity available for sale on mobile and web.
- Incomplete entry is saved automatically as a private draft that can be restored after a lost connection, with no effect on stock, debt or cash. Restoring the screen never re-posts. After a lost server response the client queries the result by its operation id before retrying.
- A posted document's quantities, costs, supplier, currency or value are never overwritten. Non-financial notes can be edited with an audit trail. Fixing quantities or cost uses a correction document linked to the original, with permission, reason and a preview of its effect — only the difference is applied.
- A quantity correction that conflicts with reserved or issued quantity is refused. A cost correction is traced through the linked movements and split three ways: quantity still in warehouses (adjusts inventory value and the SKU average), quantity issued but still in delivery custody (adjusts the custody value, carried with those goods — it goes to cost of goods sold only if they are delivered, and back to inventory if they return), and quantity already delivered (adjusts cost of goods sold). The original issue cost stays on record and a linked, traceable adjustment carries the difference; the adjustment posts in an open period. This case is enabled only once its settlement is implemented and tested.
- The invoice date is separate from the posting time: a back-dated invoice never slips silently between posted movements or recalculates the past.
Figure 18. Sequence — draft, then atomic and idempotent "Save and add to stock".

الشكل 18: مخطط التتابع — المسودة ثم «حفظ وإضافة للمخزون» كعملية واحدة محمية من التكرار.

## 13.4 Supplier accounts

- Each supplier has a name, optional contact details, a statement of invoices, payments, returns and a balance per currency. Opening balances at go-live are entered by a separate reviewed document — never as new purchases that would increase stock.
- Transport paid to a third party increases inventory cost but not the goods supplier's debt; a credit expense needs its own registered payee.
- Invoice states: unpaid, partially paid, fully paid; "overdue" is an extra tag for amounts past their due date. Without an agreed due date the invoice shows "no set due date" — no invented date or delay. One due date per invoice with any number of payments; installment plans, interest and automatic penalties are deferred.
- Each payment is its own voucher (supplier, date, amount, payment currency, method, cash/bank account, reference) with allocations to invoices. The system suggests the oldest due invoices in the chosen debt currency; the user can adjust before approving. An invoice is never closed by a payment without an explicit allocation. Allocations can never exceed an invoice's remaining balance; any excess is recorded explicitly as a supplier credit in the store's favour.
- Invoice and debt amounts stay in the invoice currency. A payment may be in that currency or in IQD; the voucher shows the debt settled, the settlement rate and the cash paid. There is no automatic offset between different currencies.
- Realised exchange differences at payment are recorded separately from inventory cost. Supplier returns produce a stock movement and a credit note linked to the invoice; they reduce the debt or create a credit, but never imply cash received. Posted invoices, payments and notes are never deleted — only reversed with a reason and permission.

| Acceptance example | Result |
|---|---|
| Lists of 100,000 / 70,000 / 50,000 IQD; one payment of 150,000 allocated 100,000 + 50,000 + 0 | Remaining 0 / 20,000 / 50,000; total debt 70,000 |
| Approved correction lowers the second list by 10,000 | Its remainder becomes 10,000; total debt 60,000; the actual payment stays 150,000 |
| Debt 100 USD booked at 1,500 (150,000 IQD), no earlier revaluation; pay 40 USD with 62,000 IQD at 1,550 | The payment settles 60,000 IQD of booked value (40 × 1,500) and costs 62,000 → realised FX loss 2,000 IQD. Remaining debt 60 USD with booked value 90,000 IQD (60 × 1,500). Invoice and inventory cost unchanged. (If the rate had fallen to 1,450, paying 58,000 would give an FX gain of 2,000.) |

## 13.5 Currencies and exchange rates

- The base currency is set when the store is first configured — currently IQD. All customer prices, carts, orders, delivery fees, COD collections and consolidated reports are in the base currency. Buying in a foreign currency never means showing or collecting sales in it.
- Foreign currencies are enabled from a known list in the Web Admin, starting with USD. Each has a fixed ISO 4217 code, a translated name, a display symbol and a display precision (e.g. IQD / دينار عراقي / د.ع; USD / دولار أمريكي / US$). The code is stored with every amount and document; used currencies are disabled, never deleted.
- A central exchange-rate screen states the direction clearly: "1 USD = … IQD". Updates are manual, with permission, and keep the old and new rate, effective time and who changed it. The screen warns when a rate is not from today; no rate is ever invented and 1 is never used by default.
- A purchase list is offered the rate for its date; an authorised user can change it for that list with a reason, without changing the central rate. If the central rate changes while a list is being edited, the numbers are not changed silently — the difference is shown and the transaction rate is confirmed at save.
- The fixed purchase rate determines the historical IQD cost. Later rate updates never change past purchase values, the historical average or past cost of sales.

## 13.6 Prices linked to a foreign currency

- Each product uses one of two pricing modes: "fixed local price" (default) or "price linked to a foreign currency", where the manager sets a reference currency and a reference selling price that already includes the desired markup.
- Linked mode: local price = foreign reference price × pricing exchange rate, then the local rounding rule. It is always recomputed from the foreign reference, never from a previously converted local price. Discounts apply after conversion.
- Changing the exchange rate shows a preview (number of linked products, old and new prices, % change, including decreases) and offers "save rate and update linked prices" — one review, then the server updates them together for mobile and web — or saving the rate only, leaving published prices unchanged and marked as awaiting the new rate. Price sets are published as a consistent version; a stale preview cannot be published.
- The sale rounding rule is configurable in IQD (default: currency precision; e.g. round up to a multiple of 250 IQD with manager approval). It never rounds purchase cost or the stock average.
Illustrative example: buy an item for 10 USD at 1,500 → cost 15,000 IQD before landed costs. Reference selling price 12 USD → 18,000 IQD. New pricing rate 1,550 → 18,600 IQD before rounding; rounding up to 250 → 18,750 IQD. The past purchase cost stays 15,000 IQD.

الملخص

واجهة واحدة لإدخال المواد المستلمة فعليًا: مورّد إلزامي مع إنشاء سريع، ومخزن وموقع افتراضيان للقائمة مع إمكانية تخصيص أي صف، وتحويل الكراتين إلى قطع، ومصاريف إيصال موزعة، وعملة واحدة للقائمة مع سعر عملية مثبت، ومسودة تلقائية دون أثر، و«حفظ وإضافة للمخزون» كعملية واحدة محمية من التكرار، والتصحيح بمستند مرتبط لا بالكتابة فوق الأصل. حسابات المورّدين تشمل الفواتير والدفعات وتخصيصها والأرصدة الدائنة وفروق الصرف والمرتجعات والأرصدة الافتتاحية. العملة الأساسية الدينار العراقي، وتُفعّل العملات الأجنبية مع أسعار صرف يدوية مؤرخة، ويمكن ربط سعر بيع منتج بسعر مرجعي أجنبي مع قاعدة تقريب ونشر جماعي بعد معاينة.

# 14. Delivery Custody, Collections & External Drivers

عهد التوصيل والتحصيل والسائق الخارجي

## 14.1 Two custodies per delivery party

- Every delivery party — registered agent or external driver — has two separate custodies: goods (by order and lot) and cash collected and due to the store. The amount expected from undelivered orders is never treated as cash received. Actual unsettled cash stays on the party until it is handed over or used through an approved action; it is never cleared by changing an order's status or deactivating the party.
- Every collection is recorded against the order and the party with amount, currency, time and performer. Custody includes everything received from the customer, including delivery fees collected for the store. The party's wages or commission are a separate account and are never deducted automatically from collections; delivery fees do not belong to the party just because they collected them.
- Order status is separate from collection and settlement: "delivered" is not a settlement with the store.

## 14.2 Receiving cash from a delivery party

- The Web Admin screen "Receive payment from delivery party" lists orders with unsettled collections and the remainder per order. The receiver enters the actual amount and distributes it; the system suggests the oldest collections first and allows editing before approval. One payment can cover many orders and one order can be settled by several payments.
- Each receipt voucher has a unique number, the party, currency, amount, actual date, handover method and receiving cash/bank account, the approving user, and optional notes. Allocation lines show the order, collection, amount allocated and remainder. Over-allocation and allocating the same money twice are refused.
- Allocations normally equal the voucher amount. Money actually received but not yet distributed can be recorded explicitly (with permission) as "received, unallocated" and allocated later without a second receipt; orders do not show as settled until it is allocated. Unallocated amounts are shown separately to explain any gap.
- The party can view their statement and send a notice that they handed over money, but a notice or a transfer photo never closes custody. The final reduction happens after actual receipt is approved by a user with cash-receiving permission — never by the party themselves, whatever other permissions they hold. A pending bank transfer stays under verification until confirmed.
- When less than expected is received, only the actual amount is recorded and the difference stays visible. An overpayment never makes old orders over-settled; it is kept as unallocated pending reconciliation. Differences never turn into deductions, commission or losses automatically.
- Approved vouchers are never deleted or edited; they are reversed fully or partly by a linked voucher with a reason and permission. Correcting an allocation alone creates no new cash movement.
Cash balance = proven opening balance + actual collections + cash given to the party by the store + incoming custody transfers − cash actually received by the store − cash refunds paid from custody − outgoing transfers − approved settlements, with reversals included. Non-cash settlements, unallocated amounts and claims in the party's favour are shown separately.

Acceptance example: collections of 100,000 (order A) and 50,000 (order B) → custody 150,000. A receipt of 120,000 allocated 100,000 to A and 20,000 to B → A settled, B and the party owe 30,000. A later 30,000 for B closes it; both vouchers and allocations stay visible.

Figure 19. Sequence — cash receipt from a delivery party with optional netting.

الشكل 19: مخطط التتابع — استلام نقدية من جهة التوصيل مع مقاصة اختيارية.

## 14.3 Owner summary

For each party the owner sees goods in custody, expected collections, collected, handed to the store, refunds paid, settlements, unallocated amounts and remainder, with ages and the last payment. Clicking a balance opens its orders, vouchers and change history; statements can be filtered by date, order and party and exported. Each party sees only their own statement.

## 14.4 External drivers without an app account

For taxis or drivers who are not store staff, the admin chooses "external driver without account" when assigning. The driver needs no login, password or app; an authorised Web Admin user records every event on the driver's behalf, keeping who recorded it, the source of the information, the event time and the recording time. The same order, stock, custody, collection, voucher and netting records are used — no separate financial system.

| Topic | Rule |
|---|---|
| Driver record | Name and phone required; vehicle number, description and notes optional. Reusable for later trips, with a warning on a repeated phone number instead of creating scattered custody accounts. It is a delivery party and custody account, not a user account. Never deleted once it has movements; can be disabled for new assignments. If the driver later becomes a registered agent, the record is linked to the account with its history, without copying or duplicating balances. |
| Trip | A numbered trip linked to the driver and one order by default, optionally several ready orders; shows orders, quantities, destinations, the amount to collect per order and the handover time. |
| Fare agreement | Recorded before sending: fare amount, who bears it (store, or customer paying the driver directly), whether it was prepaid, and any agreement for failure or cancellation. External drivers never inherit a monthly salary or per-delivery fee. One fare per trip — a three-order trip does not create the fare three times. For multi-order trips the fare is split across orders for tracking (equal split suggested, editable, must sum to the fare). Removing an order or changing the route after approval needs a documented fare review. |
| Store bears the fare | Recorded as a delivery expense and a payable to the driver when the service is approved as done per the agreement. Can be prepaid as a trip advance and allocated later, paid after, or netted against the driver's collections. The published delivery fee in the customer's order belongs to the store, is included in the amount to collect, and may differ from the fare or be zero; an order is never repriced because a more expensive taxi was used. |
| Customer pays the driver | The fare is outside the store's sales, expenses and debts and kept for information with its payer. It is never mixed with the goods value the driver collects for the store and never enters netting. Binding rule — no double charge: when the customer pays the driver directly, the store charges no other delivery fee for the same delivery service; the server checks this when the order is created and whenever the delivery method changes. The fare and who receives it are shown to the customer before the order is confirmed. For an existing order the original agreement is kept; any change needs the customer's explicit, documented acceptance before dispatch — never a surprise fare at dispatch. Each customer in a shared trip sees only their agreed share, and shares sum to the direct fare. |
| Handover | The authorised user selects ready orders and the driver and confirms the actual handover. A printable custody voucher lists trip, orders, items, quantities and amount to collect per order. The order moves to dispatched, quantities leave their locations into the driver's custody at fixed cost, and reservations settle once. The same goods cannot be on two active trips, and a dispatched order cannot be moved to another driver by renaming — a real transfer needs a transfer voucher. |
| Delivery vs collection | Staff record status from the customer's or driver's confirmation or a document, with source, time, optional note or attachment. Delivery and receipt of payment are separate events: if delivery is confirmed but not the collection, the internal state is "delivered — collection needs confirmation" and nothing is invented. Short or excess collection is a separate exception; an excess is never revenue or driver pay automatically. |
| Settlement | The same "receive payment from delivery party" screen, full or partial, across one or several trips. Netting is allowed only against an approved, unpaid trip fare borne by the store — never against a customer-paid fare or an unapproved amount, and never twice against a prepaid fare. A trip can be "delivered — settlement open". |

Figure 20. Activity — external driver trip from handover to settlement.

الشكل 20: مخطط النشاط — رحلة السائق الخارجي من التسليم إلى التسوية.

| Example (IQD) | Figures | Result |
|---|---|---|
| 1 — Store pays the fare | Goods 100,000 + store delivery fee 5,000 = 105,000 collected. Approved fare 3,000, unpaid. Store receives 102,000 cash and nets 3,000. | Driver cash custody 0, fare payable 0, cash box +102,000 only. Fare expensed once; customer fee counted as delivery revenue. If the 3,000 had been prepaid, the driver hands over the full 105,000. |
| 2 — Customer pays the driver | Goods 100,000 + direct fare 3,000, no store delivery fee. Customer pays 103,000. | Driver collected 100,000 for the store and must hand over all of it; the 3,000 is neither store expense nor revenue and is not deducted. |
| 3 — Multi-order trip, partial payment | Order A 100,000 + order B 50,000 = 150,000. Store-paid fare 10,000, unpaid. Store receives 100,000 for A and nets the 10,000 fare against B. | A settled; B and the driver still owe 40,000. The fare is counted once for the trip. |

## 14.5 Failures, cancellations and returns with custody

- A failed delivery keeps the goods in the party's custody until they are physically returned and inspected; a retry never deducts stock again or creates a new fare automatically (an extra fare needs an agreement and an approved voucher).
- Cancellation after dispatch opens a retrieval document (section 11.6); the goods do not become available for sale while still in the vehicle. Good returned stock goes to a known location, damaged stock is isolated, missing quantity becomes a reviewed exception, and custody closes only when every quantity is settled.
- In a multi-order trip each order's result is tracked on its own; one success does not mean the whole trip succeeded or all amounts were collected. The fare follows the agreement and the actual outcome, not the number of status updates.
- Loss of goods, lost contact or a disputed collection is recorded as an exception with a clear balance and follow-up documents — never cleared automatically as a fare or deduction. Finishing a trip operationally does not close its financial account or custody.
الملخص

لكل جهة توصيل (مندوب مسجل أو سائق خارجي) عهدتان منفصلتان: بضاعة ونقدية محصلة. لا يُعد المبلغ المتوقع نقدًا مقبوضًا، ولا «تم التوصيل» تسويةً مع المتجر. تُستلم النقدية بسند مرقّم مع تخصيص على الطلبات (الأقدم أولًا)، ويُسجل المستلم غير المخصص صراحةً، ولا تُغلق العهدة بإشعار أو صورة تحويل، ولا يعتمد المندوب دفعته بنفسه، وتُعكس السندات ولا تُحذف. السائق الخارجي سجل جهة توصيل دون حساب، ويُنشأ له رحلة مرقمة باتفاق أجرة يحدد من يتحملها (المتجر أو الزبون مباشرةً)، ويسجل الموظف التسليم والتحصيل نيابةً عنه، ويُفصل إثبات الوصول عن إثبات القبض، والمقاصة فقط مع أجرة معتمدة يتحملها المتجر (أمثلة 1–3).

# 15. Delivery Agent Wages & Netting

أجور المندوب وكشف مستحقاته والمقاصة

This policy covers registered delivery agents. External drivers are paid only by their trip fare (section 14.4). The policy does not change the order-monitor account's rights and never lets an agent approve their own accounts.

## 15.1 Principles

- Cash the agent collected for the store and wages owed to the agent are two separate, visible accounts, even when they are netted against each other.
- The delivery fee paid by the customer is not automatically the agent's wage; it can be higher, lower, or free to the customer while the wage is still due.
- Recognising a wage increases store expense and the amount owed to the agent. Paying or netting it later settles what is owed and never records the expense a second time.
- Wages and netting are in the store's base currency (IQD). No netting between two different people or two currencies.

## 15.2 Wage settings per agent

- Optional fixed monthly salary and optional per-delivered-order fee: either can be zero or both can apply; negative values are refused. No percentage of order value or profit in Release 1, and no automatic link to the delivery fee shown to customers.
- Settings are versioned with effective dates. A change applies to later work under the approved version and never recalculates past order wages or posted salaries. Correcting a past accrual needs a document, reason and permission.
- Bonuses and reimbursed expenses are separate lines with reason and reference — never hidden inside the base wage. No one creates a claim for themselves and approves it.

## 15.3 Monthly salary

- A payroll statement is prepared per agent per month and posted once after review, dated in that period. Before posting it shows as an estimate under review, not a payment; the month-close review warns about unposted salaries.
- A full month under a valid agreement earns the approved salary. Partial months use: monthly salary × agreement days in the month ÷ actual days in the month; the period and formula are shown for confirmation, and any different amount is posted as a reasoned adjustment.
- A mid-month salary change splits the month by rate without overlapping or repeating days. Changing login access or disabling the app account does not change the agreement's start or end date.
- No automatic deductions for closures, holidays, absence or lateness (attendance management is out of scope). Advances paid before an approved accrual are recorded as advances and later allocated — never as extra salary or salary paid twice. Salary can be paid in full or in instalments.

## 15.4 Per-order wage

- At handover the wage version for that order is stored. When delivery is proven, the server checks state and permission and creates exactly one wage accrual linked to the order, agent, price version and completion time; it does not pay or net it automatically.
- The agent who actually completed the delivery earns the success wage. If custody passed to another agent with a valid voucher, that agent's wage policy is fixed at the time they received custody, and both can never earn a full success wage for the same order; partial service for the other party is an explicit approved exception.
- Orders cancelled before dispatch or not delivered earn no success wage. A failed delivery or a return trip can be compensated by an exceptional amount set by an authorised user, referencing the attempt, without counting as a success.
- Retries never double the success wage; re-sending a status update never creates another accrual. A later customer return does not cancel a correct delivery wage; if the delivery proof itself was wrong or duplicated, the accrual is corrected by a linked reversal, reviewing its effect on payments or netting already made.
- Collection shortfalls are reviewed separately — never deducted from the wage automatically or hidden by cancelling the accrual.

## 15.5 Agent statement

One Web Admin page with three sections — "collections and custody", "wages and amounts owed", and "payments and netting". Every number opens its source, wage version and voucher; statements filter by date, order, agent and period, export, and support "balance as of a date". The agent sees only their own statement from the work app and cannot edit or approve anything. Disabling an agent or ending their work never deletes the statement or balances; the final settlement is recorded and open balances stay until resolved with documents.

## 15.6 Paying wages and netting

- Paying without netting: the authorised user records agent, amount, method, cash/bank account, date and reference, and allocates the payment to approved wage lines. One payment can cover a salary and several order wages; one accrual can be paid in several payments. Allocation cannot exceed the open amount; any excess is recorded explicitly as a separate advance. A pending transfer is not final until verified. Paying wages lowers store cash and the amount owed only — not the order cash still in the agent's custody.
- Netting is an explicit, authorised option — never a deduction the agent performs. It settles part of what the store owes the agent against an equal amount of collection cash in the agent's custody, without that part passing through the store's cash box.
- The settlement screen shows eligible collection balance, approved unpaid wages, cash actually received, proposed netting, and what each side still owes after the operation. Netting can be zero.
- The netting voucher is linked on both sides: amounts allocated to specific order collections, and amounts allocated to a period salary, order wages or other approved items. Sum of collection-side allocations = sum of wage-side allocations = netting amount. Neither side may exceed its open balance, and unapproved claims or expected (uncollected) amounts are never used. When combined with a cash receipt, both allocations are locked together so the same balance is never used twice.
- A numbered netting voucher and a receipt voucher for any cash actually received are issued as one settlement, posted consistently and protected against duplication and concurrency. Receipts show cash and netting separately; no phantom cash enters the cash box. On the order the netted part shows as "settled by netting"; on the wage accrual as "paid by netting", with no new expense.
- If collections are less than wages, the difference stays owed to the agent and can be paid by a separate voucher; if wages are less than collections, the difference stays to be handed over. The two balances are never merged into one net number that hides their origin. The system suggests the oldest collections and oldest accruals, with preview and editing before approval.

| Example (IQD, approved wages) | Figures | Result |
|---|---|---|
| A — full mixed settlement | Collections 150,000; wages 10,000; cash received 140,000; netting 10,000 | Agent owes 0, is owed 0; cash box +140,000 only; wage expense stays 10,000 (not 20,000) |
| B — partial settlement | Collections 150,000; wages 10,000; cash 100,000; netting 10,000 | Agent still owes 40,000; nothing left owed to the agent for the settled items |
| C — wages exceed collections | Collections 30,000; wages 50,000; netting 30,000, no cash | Collection custody 0; 20,000 still owed to the agent; paying it later lowers cash and the payable with no second expense |
| D — allocation across items | Order A 100,000 and B 50,000 open; cash 140,000 → 100,000 to A, 40,000 to B; netting 10,000 on B against 6,000 salary + 4,000 order wages | Both sides close with every allocation traceable; order wages need not come from order B itself |

## 15.7 Returns, corrections and exceptions

- Accepting a customer return never cancels the agent's wage or reverses a correct earlier netting. If the order was fully settled, the store pays the refund or gives the agent a dedicated amount first — no new custody is opened on the agent because of the return, and nothing is deducted from salary without a basis and approved settlement. If the refund is paid from collection cash still in the agent's custody, that collection falls only after execution is proven and approved, and the remaining balance is re-checked before any new netting.
- Correcting a wage already paid or netted never deletes the old settlement or changes historical cash: it creates a linked reversal/correction and shows the difference for review. Reversing a netting restores both open balances without a cash movement; reversing a real receipt or payment needs its own cash treatment. Re-allocating an amount between orders or accruals creates no cash movement or new expense.
- Cash or goods shortages are never classified as wage or commission automatically; they remain visible exceptions until investigated. Claims the agent paid from personal money are reviewed and recorded as a separate payable with the expense source.

## 15.8 Permissions and reports

Separate permissions for wage setup, payroll and adjustment approval, paying wages, receiving agent cash, and performing or reversing netting — assigned to one or several users. A user can never approve a financial movement in their own favour or receive a payment coming out of their own custody. Documents respect non-negative values, base currency, rounding precision, actual dates and monthly close; nothing posts into a closed period without the exception path, and approval from a stale screen whose balances changed is refused. The wage report shows salary, order wages, bonuses, corrections, owed, paid, netted and remaining per period and agent. The cash report shows only actual receipts and payments, with netting in a separate section. The profitability report counts the wage expense once in its accrual period, without waiting for the agent to hand over cash. The daily screen stays simple: choose agent → see both balances → enter cash received or paid and choose netting if needed → preview allocation → approve.

الملخص

تُفصل نقدية التحصيل التي بعهدة المندوب عن أجوره المستحقة. الأجر راتب شهري ثابت و/أو أجر لكل طلب تم توصيله، بإعدادات مؤرخة لا تعيد حساب الماضي. يُنشأ استحقاق أجر نجاح واحد لكل طلب مسلّم، ولا تضاعفه إعادة المحاولة أو إعادة الإرسال، ولا يلغيه المرتجع اللاحق. كشف الراتب الشهري يُرحّل بعد المراجعة مع تناسب الأيام للفترات الجزئية. للمندوب كشف من ثلاثة أقسام يطلع عليه دون تعديل. المقاصة خيار صريح مخوّل يساوي بين جانبي التحصيلات والمستحقات دون حركة صندوق وهمية ودون مصروف جديد (أمثلة أ–د)، مع صلاحيات منفصلة ومنع اعتماد المستخدم لصالحه.

# 16. Returns, Discounts & Loyalty

المرتجعات والخصومات والولاء

## 16.1 Customer returns

- A customer can return all or part of the items and quantities of a delivered order within the published return policy.
- At order creation each unit's share of order discounts, loyalty points and rounding is stored so that the units of a line sum exactly to the line total. Refunds use these shares across successive returns, without re-rounding that could over-refund. Discounts are distributed only over the lines they cover. The kept items are never repriced and their discount is never removed retroactively.
- The refund never exceeds what was actually paid and not yet refunded, and is paid by a separate refund voucher with method and reference. Receiving the goods, approving their value and paying the customer are separate, trackable states; "refunded" is never shown just because a return request was accepted. Concurrent return or refund requests can never consume the same entitlement.
- The refund comes from the original amount paid and the returned scope — never the item's purchase cost, today's selling price or a new exchange rate. Returned stock goes back to sale only after inspection, at the cost fixed at issue; damaged stock is isolated and its loss recorded when destroyed or written down.
- Each return records its own number, order, lines, quantities, reason, condition, inspection location, entitlement decision, approved amount, points, delivery fee, refund payments and who paid them.

## 16.2 Delivery fee on returns

Default behaviour: the delivery fee is refunded on a full return caused by a store error or a proven defect; it is not refunded automatically on a partial return or a change of mind after delivery. An authorised user may refund it as an exception with a recorded reason, within a published policy that respects local requirements. No new penalty or fee is added automatically; cancelling before dispatch creates no delivery fee owed by the customer. The fee is independent of each partial return and can never be refunded more than once.

## 16.3 Loyalty points

- Points are earned from a completed sale under the approved policy — never from a cancelled order.
- On a return, points earned on the returned part are reversed in the loyalty ledger, and points the customer used are restored based on their value stored at order time (no new conversion rate). Only the part paid in cash is refunded in cash. If reversed points were already spent, the difference is handled in the points balance or future rewards — never by silently deducting cash from the refund. All operations are protected against repetition.
- This supersedes the earlier v1 rule that returns do not claw back points.
Acceptance example (no points): two units totalling 20,000 IQD with a distributed discount of 2,000. Returning one unit refunds 9,000 only; the unit kept stays at 9,000.

## 16.4 Returns and delivery custody

- If the customer's purchase was partly unpaid because of a collection exception, the return value is first settled against the uncollected amount; only the excess actually paid is refunded. The handling is shown to the authorised user and the exception is not closed without a record.
- Approving a return or receiving the goods never reduces the delivery party's cash custody automatically. The refund's executor, source, and link to the return, order and collection voucher must be recorded; the original collection and cash handover stay on record and the refund is a new movement.
- If the party pays the refund from the order's cash still in their custody, an authorised user issues a permission for the amount and the actual payment and its proof are approved; only then do the party's cash custody and the order's open collection fall by the same amount, once. If the store pays from its cash account, the store's cash and the customer's entitlement fall while the party still owes the order cash. If the party had already handed over the cash, no new debt opens on them.
- A refund in progress is reserved so it cannot be assigned to two payers; a lost system response does not mean the payment failed.
Example: the party owes 30,000 for order B and a 10,000 return is approved. Before the refund, custody stays 30,000. If the party refunds 10,000 from custody with approval → 20,000 remains. If the store refunds from its cash box → the party still owes 30,000. If the order was already settled → the party's balance is 0 and the store's cash box bears the refund.

Figure 21. Activity — return handling with per-unit refunds, points reversal and refund source.

الشكل 21: مخطط النشاط — معالجة المرتجع مع الاسترداد لكل وحدة وعكس النقاط ومصدر الدفع.

الملخص

يُتاح إرجاع كامل أو جزئي لطلب مسلّم. تُحفظ حصة كل وحدة من الخصم والنقاط والتقريب عند إنشاء الطلب ويُحسب الاسترداد منها دون إعادة تسعير الباقي (مثال: وحدتان بـ20,000 وخصم 2,000، إرجاع وحدة يعيد 9,000). الاستلام والفحص والاعتماد والدفع حالات منفصلة، ولا يتجاوز الاسترداد المدفوع فعليًا. رسوم التوصيل تُرد افتراضيًا في الإرجاع الكامل بسبب خطأ المتجر فقط. تُعكس النقاط المكتسبة للجزء المرتجع وتُستعاد النقاط المستعملة (يحل محل قرار عدم الاسترجاع السابق). لا يخفض المرتجع عهدة المندوب تلقائيًا، ويُسجل مصدر دفع الاسترداد صراحةً.

# 17. Accounting Core: Ledger, Expenses & Period Close

النواة المحاسبية: السجل والمصاريف والإقفال

## 17.1 Unified double-entry ledger

Every financial movement is posted to one balanced ledger in the base currency, keeping the original currency and reference. Stock, supplier, delivery-party, cash and expense records all reconcile to it. Screens create the entries automatically — the owner never types journal entries for routine work — and profit is never computed from separate totals that could double-count. Each movement carries a unique document reference, performer and time, and is protected against duplication and concurrency.

The entries below are worked, balanced examples — not a complete chart of accounts. Account names are indicative; build phase 3 finalises the chart and implements every scenario here as an automated test before any financial posting ships. Each row is one complete entry (debits = credits).

Common figures: goods 100,000 IQD + store delivery fee 5,000 IQD = 105,000 due from the customer; issue cost of the goods 60,000 IQD.

| Scenario | Debit | Credit |
|---|---|---|
| Purchase posted (credit purchase) | Inventory — net cost + landed cost | Supplier payable (goods); freight payable or cash (third-party transport) |
| Handover to delivery party | Goods in delivery custody 60,000 | Inventory 60,000 |
| Delivered — full collection confirmed (105,000) | Cost of goods sold 60,000 / Cash in delivery custody (party) 105,000 | Goods in delivery custody 60,000 / Sales revenue 100,000 / Delivery-fee revenue 5,000 |
| Delivered — collection short (95,000 collected) | Cost of goods sold 60,000 / Cash in delivery custody 95,000 / Collection exceptions — under review 10,000 | Goods in delivery custody 60,000 / Sales revenue 100,000 / Delivery-fee revenue 5,000 |
| Delivered — collection not yet confirmed | Cost of goods sold 60,000 / Collection awaiting confirmation 105,000 | Goods in delivery custody 60,000 / Sales revenue 100,000 / Delivery-fee revenue 5,000 |
| …later confirmed at 105,000 (no new sale) | Cash in delivery custody 105,000 | Collection awaiting confirmation 105,000 |
| …later confirmed at 95,000 | Cash in delivery custody 95,000 / Collection exceptions — under review 10,000 | Collection awaiting confirmation 105,000 |
| Exception resolved — party hands over the missing 10,000 | Cash in delivery custody 10,000 | Collection exceptions — under review 10,000 |
| Exception resolved — approved loss | Collection losses (expense) 10,000 | Collection exceptions — under review 10,000 |
| Cash received from the party (105,000) | Cash box / bank 105,000 | Cash in delivery custody 105,000 |
| Customer return: net-paid share 20,000, while 10,000 of the order is still an open collection exception | Sales returns 20,000 | Collection exceptions — under review 10,000 / Refunds payable 10,000 |
| …refund paid (store cash, or party custody with approval) | Refunds payable 10,000 | Cash box, or cash in delivery custody, 10,000 |
| …returned goods restocked at original issue cost 12,000 | Inventory 12,000 | Cost of goods sold 12,000 |
| Delivery-fee refund (policy case: full return caused by a store error) — separate line | Delivery-fee refunds (contra revenue) 5,000 | Refunds payable 5,000 |
| Supplier payment — FX loss (40 USD booked at 1,500, paid 62,000 at 1,550) | Supplier payable 60,000 / FX loss 2,000 | Cash / bank 62,000 |
| Supplier payment — FX gain (same debt, paid 58,000 at 1,450) | Supplier payable 60,000 | Cash / bank 58,000 / FX gain 2,000 |
| Wage accrual / store-paid trip fare | Delivery wages expense | Wages or fares payable |
| Wage payment | Wages payable | Cash / bank |
| Netting | Wages or fares payable | Cash in delivery custody |
| Count variance / write-down | Inventory loss (or inventory) | Inventory (or inventory gain) |
| Expense approved, then paid | Expense (accrual period); then expense payable | Expense payable; then cash / bank |

- “Collection awaiting confirmation” and “collection exceptions — under review” are store receivables pending investigation. They are never cash in the party's custody and never a personal debt of the party or the customer until an approved decision says so.
- Confirming a collection later only moves the amount into cash custody; the sale is never recognised twice.
- On a return, the refund entitlement is first set against any part of the order that was never collected; only the remainder becomes a cash refund. The delivery-fee refund is always its own line, separate from the goods value.

## 17.2 Expenses

- A separate Web Admin section with a short form: automatic number, document date, accrual date/period, type, payee, amount and currency (with the fixed rate when needed), description, optional reference or attachment, and amount paid now with method and cash account. It can be saved as a draft with no effect, then approved with permission; an authorised user can enter and approve in one step.
- Initial types (editable): rent, salaries, electricity, internet, advertising, maintenance, delivery wages. Used types are disabled, not deleted. Salaries here are total expenses or actual documents — not a full HR system.
- Approval records the period expense and liability; payment lowers cash and the liability and never creates the expense again. Full, partial and credit settlement are supported; unpaid amounts need a named payee with a statement (an existing supplier's account is reused, never duplicated).
- An expense for a given month belongs to that month's report even if paid later. Prepayments covering several periods are spread by documented periodic adjustments, never charged fully to the month paid.
- No expense is entered here if it is already recorded by an invoice or another document: landed transport added to inventory cost is not also an operating expense, paying a supplier is not a new purchase or expense, and a party's cash handover is not new revenue. Delivery cost of sales is separate from the cost of bringing goods into the warehouse.
- Owner drawings, owner deposits and transfers between cash accounts are separate from operating expenses and revenue. Long-lived asset purchases are not expensed automatically; if depreciation is not implemented, the profitability report says so.
Acceptance example: a month's rent of 300,000 IQD, 100,000 paid. The month shows rent expense 300,000, paid 100,000, liability 200,000. Paying the rest next month lowers cash and the liability by 200,000 without re-counting the expense. Buying goods for 500,000 without selling them or recording a loss does not reduce profit at purchase or payment.

## 17.3 Editing limits, corrections and monthly close

- The rule is not "editable for N days": a payment or issue can link to a document right after it is saved. Unposted drafts are editable; posted documents never have quantities, costs, supplier, currency or value overwritten. Non-financial notes can change with an audit trail.
- A simple "Correction" action for authorised users shows the original, the change, the reason and its effect on stock, cost and debt before approval, then creates a correction or reversal document linked to the original. It never re-adds the whole quantity or changes the fact of cash already paid. If a partly or fully paid list is reduced, the entitlement is reduced by an approved document and any overpayment becomes a credit in the store's favour.
- Manual monthly close after review, by a permission the owner assigns — never automatic at midnight. The close screen shows unposted invoices, expenses and drafts, differences, pending settlements, and reconciliation of cash, stock, supplier and delivery-party accounts. A correct open debt or known cash in a party's custody does not block closing; it carries forward as a clear balance.
- Unbalanced entries and unexplained reconciliation differences cannot be approved. The close point, reconciliation reports, approver and time are stored, and closing balances open the next period without creating any purchase, sale or payment.
- After close, the server refuses edits to posted movements and any new movement dated inside the closed period. A late document keeps its original date and posts its effect in an open period with a clear posting date, or goes to an authorised user to decide on reopening. Closing does not stop paying an old invoice or recording a real return in the current period.
- Reopening is an exception with special permission, a recorded reason and impact review; a reference copy of the previous close is kept and differences are shown at re-close, with later periods' openings reconciled.
الملخص

تُرحّل كل حركة مالية إلى سجل محاسبي موحد متوازن بالدينار مع حفظ العملة الأصلية والمرجع، وتنشئ الشاشات القيود آليًا دون قيود يدوية للعمليات الاعتيادية. قسم مصاريف مستقل يفصل الاعتماد (إثبات المصروف والالتزام) عن الدفع، ويدعم الدفع الجزئي والآجل والمقدم الموزع على الفترات (مثال الإيجار 300,000 المدفوع منه 100,000). المستند المرحّل لا يُعدّل بل يُصحح بمستند مرتبط. الإقفال الشهري يدوي بعد المراجعة، ويُمنع بعده الترحيل داخل الفترة المقفلة، وإعادة الفتح استثناء بصلاحية وسبب.

# 18. Pricing Protection & Input Safeguards

حماية الأسعار والحقول الحساسة

Protection is applied in the UI and on the server, including imports and bulk operations. Final totals, costs and permissions come from the server; totals or exceptions sent by a client are never trusted. There are hard limits that cannot be bypassed, and legitimate business exceptions that need a permission, a recorded reason and an impact preview — a generic "continue" button never overrides every protection.

## 18.1 Selling price and cost

- One current base selling price per identical SKU applies to its old and new lots; different purchase costs never create per-lot selling prices. Different variants of one product may have different prices. Approved discounts are a clear layer on top.
- Saving a purchase never changes the selling price automatically. The purchase screen shows the new cost in IQD, the expected average after saving, the current selling price, and an optional field to change the manual price or the foreign reference price (with permission). Old and new price, who changed it and when are recorded; a change based on a stale price is refused if another user changed it meanwhile.
- Reference cost for protection = the higher of the SKU moving average and the SKU last landed purchase cost, in IQD and per equivalent selling unit. It is a review indicator, not a guaranteed repurchase price, and does not replace the average for valuation.
- Publishing a price below the reference cost — or a discount rule that leads there — is blocked unless a user with "approve sale below cost" records a reason (e.g. clearance) and a scope: product, approved price or discount, reference cost, and a time limit or maximum quantity. The allowed quantity is protected from concurrent use, and the review is required again if conditions worsen the loss.
- The optional markup alert (store default, per-product override) is a business warning when the price still covers cost. Markup is not margin: 20% on a 10,000 cost gives 12,000, a margin of about 16.67% of the price.
- If a new purchase raises cost so that the current price violates protection without a valid exception, new orders for that item pause ("temporarily unavailable" to customers, without revealing cost) and the manager sees the items needing review. The price is never raised automatically and real stock is never hidden. Administrative pause is kept separate from out of stock.
- A new product needs publishing data and an approved selling price before customers see it; adding stock alone never publishes an incomplete product. Without a reliable cost, a new product stays unpublished until cost is entered or a documented free supply is approved. Purchase costs, internal notes and storage locations are never shown to customers.
- Combined discounts, points, exchange rate and rounding are checked on the server when computing the final price: total line discounts cannot exceed its value, percentages must be 0–100%, final values cannot be negative. A free item or 100% discount is a deliberate case with permission and reason — never the result of an empty field or a conversion error.

## 18.2 Dates

- Purchase/receipt dates default to today in the store timezone, from the server clock. Receipts, payments, collections and counts cannot be dated in the future; planned operations stay drafts or due dates with no effect. Future dates are allowed only where meaningful (supplier due dates, expiry dates).
- Expired goods cannot be received as sellable supply without a separate documented treatment; a production date, if present, must precede the expiry date.
- Normal back-dating window: 90 days, configurable by the owner. Older dates stop the normal save and need permission, a reason and an impact preview; the date is never silently changed to today. The window never overrides a closed month.
- Documents older than the system start date go through the opening-balance path or an approved correction after checking they were not recorded before — never as a normal new purchase that could double stock. Original document date, posting date and creation time are stored separately.

## 18.3 Amounts, quantities and currencies

- Saving is refused with an empty required amount, non-numeric text, a non-positive quantity, a negative purchase or selling price, a zero or negative exchange rate, or a value beyond safe precision. Negative values are never used in a normal purchase list as a shortcut for a return. Zero is allowed only where it has explicit meaning (e.g. "paid now = 0" for a credit purchase).
- Arabic and English digits are both accepted with one interpretation; the currency and unit appear next to every amount. Ambiguous thousand or decimal separators are rejected rather than guessed, and the formatted amount is shown before saving.
- Line totals, discounts, landed costs, conversions and remainders are server-computed and not directly editable. Pack-versus-piece comparisons are protected, and warehouse/location consistency and split totals are re-checked.
- Unusual changes in cost or selling price, up or down, relative to the previous reference trigger an extra review (suggested initial threshold 50%, adjustable by the owner, with separate limits for issues, quantities and large amounts). The alert shows old and new value, % change, affected total, currency and unit. With no previous value, no reference is invented and the first entry's totals are reviewed clearly.
- When data or permissions change during a review, the server rejects the stale preview and asks for a refresh.

## 18.4 Messages and exception log

Messages appear next to the field, state the problem and how to fix it — e.g. "Selling price 8,000 IQD is below the reference cost 10,000 IQD; change the price or request clearance approval", or "Receipt date is after today; choose the actual receipt date". Inputs are kept and no database or backend messages are shown. Approved exceptions are logged with original and new value, reason, user, time, document and permission scope, in a filterable report for the owner. If the server refuses an operation, no part of it is posted.

الملخص

سعر بيع أساسي واحد لكل منتج، ولا يغير حفظ المشتريات السعر تلقائيًا. الكلفة المرجعية للحماية هي الأعلى من المتوسط وآخر كلفة شراء شاملة المصاريف، ويُمنع البيع دونها إلا باستثناء مخوّل محدد السبب والنطاق والمدة أو الكمية. ارتفاع الكلفة يوقف الطلبات الجديدة مؤقتًا دون رفع السعر آليًا. تُمنع التواريخ المستقبلية للاستلام والقبض والدفع والجرد، ونافذة الإدخال القديم 90 يومًا قابلة للضبط. تُرفض القيم الفارغة والسالبة والملتبسة، وتُقبل الأرقام العربية والإنجليزية، والإجماليات يحسبها الخادم، ويُراجع التغير غير المعتاد (50% افتراضيًا)، والرسائل بجانب الحقل مع حفظ المدخلات.

# 19. Notifications

الإشعارات

| Recipient | Events (Release 1) |
|---|---|
| Order monitor | New order, order cancelled, delivery failed. |
| Customer | Order confirmed, status changes, out for delivery, delivered, cancellation, return updates, loyalty points, review moderated, promotions (opt-out). |
| Delivery agent | Assigned order, changes to assigned work, statement notices within their role. |
| Authorised staff | Orders late for acceptance, auto-cancel warnings, stock and cost alerts needing review (in the Web Admin). |

- Each event creates exactly one saved notification per recipient on the server, delivered to the mobile app (push) and to a notification center inside the web store. The web bar shows an unread badge or count and an open page updates live when a notification arrives (Server-Sent Events).
- Read state is shared across devices and interfaces: opening a notification on the phone makes it read on the web and vice versa. Arrival alone never marks it read. On sign-in or app resume the state is fetched from the server and kept in sync during use. Reading one notification never clears others and never deletes it from history.
- Tapping a notification opens the right page for the recipient's role.
- Browser push while the site is closed is not required in Release 1; in-web notifications are saved and shown on return. Notification texts are fixed in this phase; a template editor is deferred. Mandatory order-confirmation SMS stays on; customers manage other preferences per type and channel.
- Notifications to customers about external-driver deliveries never reveal the driver's account or other customers' orders.
الملخص

إشعارات الإدارة لمتابعة الطلبات: طلب جديد، إلغاء طلب، تعذر التوصيل. كل حدث ينشئ إشعارًا واحدًا محفوظًا لكل مستلم، يصل للهاتف ولمركز إشعارات داخل متجر الويب مع عداد غير المقروء وتحديث مباشر. حالة القراءة مشتركة بين الأجهزة، والوصول وحده لا يجعل الإشعار مقروءًا، والضغط يفتح الصفحة المناسبة للدور. لا تُشترط إشعارات المتصفح عند إغلاق الموقع في المرحلة الأولى، والنصوص ثابتة.

# 20. Reports & Settings

التقارير والإعدادات

## 20.1 Operational reports

| Report | Content |
|---|---|
| Sales | Net sales after discounts and returns, with cost fixed at issue; cancelled and pending orders excluded from completed sales. |
| Purchases | Cash, credit and partially paid purchases and what was paid. |
| Stock | By warehouse and location: on hand, reserved, available, in delivery custody; low stock and near expiry; counts, damage and adjustment differences. |
| Suppliers | Statement per supplier and currency; invoices with their allocated payments and credits; remaining and overdue by due date (no-due-date debts separate; aging 1–30, 31–60, 61–90, 90+); purchase-related cash movements and refunds; realised FX differences. Balances in each currency separately, with an optional estimated IQD equivalent at a declared rate and date. |
| Delivery custody | Per party: cash collected, handed over and remaining; goods in custody; failed and returned orders; exceptions, pending transfers and reversals shown, not hidden; external drivers tagged by type with trips, fares agreed, owed and paid, and customer-paid fares shown as outside store accounts. |
| Returns | Requested vs received quantities, sellable vs damaged, approved, paid and remaining amounts, delivery fees and points returned, and the source of each refund payment. |
| Wages | Salary, order wages, bonuses, corrections, owed, paid, netted and remaining per period and agent. |
| Expenses | Type, period, payee, original amount and IQD equivalent, recognised in the period, paid, remaining, overdue and reversals — without double counting. |

Best-seller and delivery-performance analytics are deferred unless already committed; no previously approved feature is dropped without reviewing its scope.

## 20.2 Financial reports

- Profitability: net sales for the period after discounts and returns, cost of sales, gross profit, operating expenses recognised in the period, and the operating result, with delivery revenue and cost, other effects and FX differences each on a clear line without duplication. The difference between sales and cost is called "gross profit", not "net profit"; the report is never titled "final net profit" unless all relevant items (including depreciation and taxes when applicable) are included — missing items are declared as not covered, not as zero.
- Cash: cash and bank balances, actual receipts and payments, cash held by delivery parties; netting in a separate section.
- Liabilities and balances: supplier debts, unpaid expenses, and balances and claims for or against the store.
- Profit is never confused with cash: an accrued unpaid expense, or a completed sale whose cash the party has not handed over yet, are both visible as such.
- Every report supports a period, an "as of" date, filters and export, and drills from any total to its documents and movements. An "as of" balance uses movements and allocations up to that date, not today's invoice state — a later payment never changes a past period's debt. Posting dates, corrections and open/closed period state are shown, with warnings for drafts and unapproved exceptions. Historical purchase cost, average valuation and last purchase cost are reported separately.

## 20.3 Settings

| Group | Settings |
|---|---|
| Store | Store data and branding (white-label), delivery fee, return policy, loyalty settings (if the feature is enabled). |
| Operations | Warehouses and locations, business hours, closed days, timezone (default Asia/Baghdad), acceptance alert timeout, optional auto-cancel and its timeout and warning, default low-stock threshold. |
| People | Users, presets and per-action permissions, work phones and their roles. |
| Money | Cash/bank accounts, expense types, currency enablement and exchange rates, sale rounding rule, optional markup alert %, permission to publish exchange-rate-linked prices. |
| Controls | Permissions for stock and cost corrections, below-cost exceptions, back-dated documents, period close and reopen; back-dating window; unusual-change thresholds for cost, price, quantity and exchange rate. |
| Fixed after first movements | Valuation method (moving weighted average) and base currency; exchange rates keep updating without rewriting history. |

الملخص

التقارير الأساسية: المبيعات، والمشتريات النقدية والآجلة والجزئية، والمرتجعات، ورصيد المخزون حسب المخزن والموقع مع المحجوز والمتاح وعهدة التوصيل، ونقص المخزون وقرب الانتهاء، والجرد والتالف، وكشوف المورّدين وأعمار الديون، وعهد التوصيل والأجور والمصاريف. التقارير المالية الثلاثة: الربحية (مجمل الربح لا صافي الربح ما لم تكتمل العناصر)، والنقدية، والالتزامات والأرصدة، مع «الرصيد كما في تاريخ» والتصفية والتصدير والانتقال إلى المستندات. الإعدادات تشمل بيانات المتجر وساعات العمل والمنطقة الزمنية ومهلة القبول والمخازن والمستخدمين والصلاحيات والعملات والتقريب وحدود الحماية.

# 21. Database Design

تصميم قاعدة البيانات

## 21.1 Principles

- PostgreSQL schema evolved only through versioned Prisma migrations; a CI drift check fails the build if the migrated database and schema.prisma disagree.
- UUID primary keys; exact decimal types for money, costs and rates, with internal precision above display precision; a currency code stored with every amount and document.
- The stock item is the SKU (product_variants row): lots, balances, reservations, movements, availability thresholds and average cost reference the variant, never only the product.
- Quantities are exact decimals (three decimal places) in the SKU's base unit; a per-SKU whole-units flag enforces integers for pieces, and pack factors are stored on each movement.
- Posted documents, stock movements, journal entries and vouchers are append-only: corrections are linked reversal or correction rows, never updates or deletes.
- Balances (stock per lot and location, custody, supplier and party balances, loyalty points) are derived from movements and allocations; any cached balance is reconciled against its ledger, which stays the source of truth.
- Idempotency and operation keys have unique constraints; concurrency-sensitive operations lock the rows they depend on inside one transaction.
- Every table carries created/updated timestamps; documents also store original document date, posting date and creator.

## 21.2 Data dictionary by area

| Area | Main tables (indicative) | Notes |
|---|---|---|
| Access | users, work_phones, staff_accounts, permissions, permission_presets, preset_permissions, staff_presets, staff_grants, sessions, audit_logs | One app role per phone; staff password hash and permission version; audit of all changes. |
| Catalog | categories (2 levels), brands, products, product_variants (SKUs), product_images, price_versions, discounts, banners, coupons | Product: pricing mode, foreign reference price. SKU: base unit, whole-units flag, optional price override, low-stock threshold. Negotiation fields removed. |
| Customer | addresses, carts, cart_items, wishlist_items, product_reviews, delivery_ratings, loyalty_ledger, device_tokens, notification_prefs, notifications | Notifications store recipient, type, deep link and read_at. |
| Orders | orders, order_items, order_events, deliveries, collections, pick_lists, pick_lines | Separate status, collection status and settlement status; per-unit discount/points/rounding shares; acceptance deadline. |
| Inventory | warehouses, locations, stock_lots, lot_balances, stock_movements, reservations, custody_holdings, sku_costs, stock_counts, count_lines, retrievals, retrieval_lines | Lot identity preserved through transfers; average cost per SKU; decimal quantities; retrieval documents for goods coming back after dispatch. |
| Purchasing | suppliers, purchase_documents, purchase_lines, landed_costs, correction_documents, supplier_invoices, supplier_payments, payment_allocations, supplier_credits, supplier_returns, purchase_drafts | Operation id for idempotent posting; invoice amounts in invoice currency. |
| Currency | currencies, exchange_rates | ISO code, display precision; rate history with who and when. |
| Delivery money | delivery_parties (agent / external driver), trips, trip_orders, trip_fares, cash_receipts, receipt_allocations, unallocated_receipts, custody_transfers, collection_exceptions | One party model for agents and drivers. |
| Wages | wage_versions, wage_accruals, payroll_statements, advances, wage_payments, wage_payment_allocations, netting_vouchers, netting_lines | One success accrual per delivered order. |
| Returns | returns, return_lines, refund_vouchers | Separate receive / inspect / approve / pay states. |
| Finance | ledger_accounts, journal_entries, journal_lines, periods, period_closes, cash_accounts, cash_transfers, owner_transactions, expense_types, expenses, expense_payments | Balanced entries in base currency with original currency kept. |
| Settings | store_settings, business_hours, closed_days, protection_thresholds | Timezone, acceptance timeout, auto-cancel, rounding rule, back-dating window. |

الملخص

تتطور قاعدة PostgreSQL عبر هجرات Prisma فقط مع فحص انحراف في CI. المفاتيح UUID، والمبالغ عشرية دقيقة مع كود العملة لكل مبلغ. المستندات المرحلة والحركات والقيود والسندات إضافية فقط وتُصحح بسجلات عكس مرتبطة، والأرصدة مشتقة من الحركات. الجداول مقسمة حسب المجالات: الوصول، الكتالوج، الزبون، الطلبات، المخزون، المشتريات، العملات، أموال التوصيل، الأجور، المرتجعات، المالية، الإعدادات.

# 22. API Design Overview

تصميم واجهات الـ API

A versioned REST/JSON API under /api/v1, described by api/openapi.yaml — the single source of truth, versioned with a changelog for every breaking change. The contract is v5.5.0 on main; Phase 1 introduces surfaces and the new permission model as v6.0.0. Paths below are representative; final paths follow the contract.

| Area | Representative endpoints | Access | Status / build phase |
|---|---|---|---|
| Auth | POST /auth/request-otp · POST /auth/verify-otp · GET / PATCH /me | Public / app | Live |
| Admin auth & access | POST /admin/auth/login · staff users · presets · work phones | Admin | Phase 1 |
| Catalog | GET /categories · GET /products · GET /products/{id} · GET /banners · admin CRUD | Public / admin | Live (brands: Phase 4) |
| Cart & checkout | GET /cart · POST /cart/items · coupon apply · DELETE /cart/coupon · POST /orders (Idempotency-Key) | Customer | Live (lot reservation: Phase 7) |
| Orders | GET /orders · GET /orders/{id} · customer cancel / cancellation request | Customer | Live (cancel rules: Phase 7) |
| Admin orders | GET /admin/orders · order transitions · pick list · handover | Admin | Live (per-transition permissions: Phase 1/7) |
| Monitor orders | Read-only list with status, search, date range, pagination · detail without images | Order monitor | Phase 2 |
| Deliveries | GET /deliveries/assigned · delivery status transitions · assign · delivery rating | Agent / admin / customer | Live (retry, collection: Phase 7–8) |
| Addresses, wishlist, reviews | addresses CRUD · wishlist list/add/remove · POST /products/{id}/reviews · PATCH / DELETE /reviews/{id} · GET /me/reviews · review moderation | Customer / admin | Live |
| Returns & loyalty | GET / POST /returns · returns queue · inspect · complete · GET /loyalty · POST /loyalty/redeem · admin adjust | Customer / admin | Live (v2 rules: Phase 9) |
| Notifications | device tokens · preferences · inbox · mark read · live stream (SSE) | All roles | Live (inbox, read sync, SSE: Phase 2) |
| Inventory | warehouses · locations · lots · movements · transfers · counts · write-downs | Admin | Phase 5 |
| Purchasing & suppliers | purchase drafts · post purchase · corrections · suppliers · supplier payments · allocations · supplier returns | Admin | Phase 6 |
| Currencies | currencies · exchange rates · linked-price preview and publish | Admin | Phase 3–4 |
| Delivery money | party statements · cash receipts · allocations · netting · custody transfers · external drivers · trips | Admin / agent (read own) | Phase 8 |
| Wages | wage versions · payroll statements · wage payments · advances | Admin / agent (read own) | Phase 10 |
| Finance | cash accounts · expenses · owner transactions · periods · close / reopen | Admin | Phase 3 / 11 |
| Reports | sales · purchases · stock · suppliers · custody · wages · expenses · profitability · cash · liabilities | Admin | Phase 12 |

Error contract: one error shape for every endpoint (HTTP status, error code, field errors); 422 for validation, 403 for policy refusals with a clear code (e.g. work account cannot shop), 409 for conflicts (stale state, stock taken, price changed) carrying the data the client needs to recover.

# 23. Security & Data Protection

الأمان وحماية البيانات

- Transport: HTTPS/TLS everywhere with HSTS; the Web Admin on its own subdomain.
- Authentication: Phone OTP with hashed, short-lived codes and per-phone rate limits on the app surface; argon2id passwords, lockout/backoff, forced change after reset, and login auditing on the admin surface; surface-bound JWT access and refresh tokens.
- Authorization: Deny-by-default policy on every route (surface + role + permission), current permissions read on every request, immediate revocation, CI checks for missing policies and a full authorization matrix.
- Separation of duties: No approval of financial actions in one's own favour; the party whose custody pays cannot receive or approve that payment.
- Data integrity: Atomic transactions, row locks for stock and money, idempotency keys, append-only ledgers, closed-period locks.
- Input handling: Server-side validation of every field, parameterised queries, strict numeric parsing, server-computed totals.
- Confidentiality: Purchase costs, internal notes, storage locations and other customers' data are never exposed to customers or work accounts beyond their role.
- Operations: Secrets outside the code, encrypted and tested backups, audit logs for sensitive actions, error tracking and monitoring.
الملخص

الأمان مبني على التشفير الكامل، ورمز تحقق مجزأ ومحدود المحاولات لسطح التطبيق، وكلمات مرور argon2id مع قفل الحساب وتدقيق الدخول لسطح الإدارة، ورموز مرتبطة بالسطح، ومنع افتراضي لكل مسار مع قراءة الصلاحيات الحالية في كل طلب، وفصل المهام في العمليات المالية، وعمليات ذرية مع أقفال ومفاتيح منع التكرار، وعدم كشف الكلفة والمواقع الداخلية لغير المخوّلين، ونسخ احتياطي مشفر ومختبر.

# 24. Localization & RTL Support

التعريب ودعم الاتجاه من اليمين لليسار

- Arabic-first and bilingual: every catalog entity stores Arabic and English names (both required at entry, with a read-time fallback so nothing shows blank).
- Full right-to-left mirroring in the Flutter app, the web store and the Web Admin; Cairo font.
- Currency formatting by ISO 4217 code with CLDR-style rules and one shared formatter on Flutter, web and documents; the symbol (e.g. د.ع) is never hard-coded in screens, and the currency code is shown whenever there is a risk of confusion.
- Arabic and English digits accepted in every numeric input with one interpretation; ambiguous separators rejected; formatted value shown before saving.
- Store timezone (Asia/Baghdad by default) for business hours, acceptance timers, document dates and reports; local date formats.
- Localized SMS, push and in-app notification texts; a language preference that persists per user.
- Arabic-aware search (normalisation and typo tolerance) via Meilisearch.

# 25. Delivery Roadmap & Phases

خارطة الطريق والمراحل

"Phase 1 … 13" below are build phases: internal development steps, not releases. Each build phase is one backend pull request with its contract changes, migrations and acceptance tests, merged into main behind green CI. Front ends then integrate against the real endpoints — never mocks. Money-posting modules come after the accounting core; mobile-facing work comes first so the mobile developer is never blocked.

| # | Phase | Main contents | Size |
|---|---|---|---|
| 1 | Access & roles | Admin password login; surfaces; one role per phone; work accounts blocked from shopping; per-action permissions and presets with immediate effect; deny-by-default; staff and work-phone management; authorization matrix | L |
| 2 | Notification center + monitor orders | Saved inbox per recipient, read sync, unread counts, SSE live updates; new-order / cancellation / failed-delivery events; read-only monitor orders with combined server-side filters | M |
| 3 | Financial core | IQD base currency and currency on every amount; foreign currencies and rates; document numbering; operation-id idempotency and drafts; date rules; double-entry ledger; cash/bank accounts; period close; store settings | L |
| 4 | Catalog v2 | Two-level categories with reviewed migration; brands; three-state availability and thresholds; fixed or currency-linked pricing with rounding and versioned publish; negotiation removal | M |
| 5 | Inventory + costing | Warehouses and location codes; lots with per-location balances; movement ledger; transfers; counts; damaged stock; delivery custody; weighted-average engine; opening balances | L |
| 6 | Purchasing + suppliers | Purchase posting (units, landed cost, per-row locations, drafts); supplier invoices, payments, allocations, credits, FX differences; supplier returns; corrections | L |
| 7 | Order lifecycle v2 | Lot reservation at creation under concurrency; FIFO/FEFO, pick lists, reallocation; rejected / cancel / cancel request; per-transition permissions; acceptance timeout; handover at fixed cost; failed → retry; price-change acceptance; below-cost protection | L |
| 8 | Delivery custody + external drivers | Collections at delivery and exceptions; cash receipts with allocation; unallocated receipts; reversals; custody transfers; statements; external driver records, trips and fares | M–L |
| 9 | Returns v2 | Per-unit shares; refund vouchers and separate states; delivery-fee policy; points reversal; refunds from custody; restock at issue cost | M |
| 10 | Wages & netting | Wage versions; per-order accruals; monthly payroll with proration; advances; payments; netting; trip-fare netting | M |
| 11 | Expenses | Accrual vs payment; prepaid spreading; owner drawings, deposits and transfers | S–M |
| 12 | Reports | All operational and financial reports with as-of date, drill-down and export | L |
| 13 | Acceptance + docs | The team's acceptance tests automated; UAT script; documentation update | M |

## 25.1 Milestones

| Milestone | Phases | Meaning |
|---|---|---|
| A — internal: the order flow runs on lot-level stock | 1–5, 7 | Access, monitor and notifications, financial core, catalog v2, lot-level stock (seeded or opening balances) and the full order lifecycle — demonstrated and tested on staging. |
| B — internal: every dinar is traceable | 6, 8, 9 | Suppliers and purchasing, delivery custody and external drivers, returns v2 — on staging. |
| C — internal: accounting complete | 10–12 | Wages and netting, expenses, reports — on staging. |

Milestones A, B and C are internal checkpoints for demonstration and testing on a staging environment. None of them is a production launch or the operational acceptance of the project unless the owner and client agree an explicit, written scope change.

## 25.2 Front-end tracks (one phase behind the backend)

| Track | Work |
|---|---|
| Web Admin (Next.js, admin/) | Starts after Phase 1: shell, login, staff/presets/work phones → orders operations and pick lists → catalog, brands, prices → settings, currencies, rates → purchasing, suppliers, inventory → custody, drivers, trips, wages → returns → expenses and close → reports. The largest single piece of front-end work in the project. |
| Web store (Next.js) | Work-account mode (monitor and agent pages) → notification center → IQD formatting and currency rules → brands and availability labels → price-change acceptance, customer cancel and cancellation request. |
| Mobile (Flutter) | Now: remove admin edit actions and negotiation UI. After Phase 1: role-based login and work mode. After Phase 2: read-only monitor orders (reusing the existing chips and load-more components) and the synced inbox. After Phase 4: brands and availability. After Phase 7–8: handover, amount collected, failure reason, retry; customer cancel and price-change acceptance. |

## 25.3 Release 1 — definition and acceptance gate

Release 1 is the first operational release — the team documents' «المرحلة الأولى». It goes live only when every item below is true; a complete backend alone is not enough.

| Gate item | Required evidence |
|---|---|
| Build phases | Phases 1–13 merged on main with all CI checks green (contract, drift, unit, real-database acceptance, web mock and live suites). |
| Interfaces | Web Admin, web store and Flutter app integrated against the real API for every Release 1 function in their role — no mocks. |
| Business cycles end to end | Purchase → stock → order → reservation → preparation → handover → delivery → collection → cash receipt / netting → return and refund → expense → period close, each reconciled to the ledger. |
| Acceptance suite | Every test in section 29 passes against a named, tagged build; results are stored with the version tested. |
| UAT | Owner-run scenarios for each role signed off, including the numeric examples in this document. |
| Operations | Production SMS/OTP gateway, hosting with TLS and domain, production object storage, backups with a tested restore, monitoring. |
| Migration | Opening stock quantities and values, supplier balances and cash balances entered by opening-balance documents and reconciled. |

الملخص

ثلاث عشرة مرحلة، كل مرحلة طلب دمج واحد للخلفية مع العقد والهجرات والاختبارات، ثم تتكامل الواجهات مع الخادم الحقيقي. تأتي النواة المالية قبل الوحدات التي ترحّل مبالغ، وتأتي أعمال الهاتف أولًا. المحطات: (أ) المتجر يعمل على مخزون حقيقي، (ب) تتبع كل دينار، (ج) اكتمال المحاسبة. لوحة الإدارة أكبر عمل واجهات في المشروع وتبدأ بعد المرحلة الأولى.

# 26. Budget Baseline & Scope Impact

الميزانية الأساسية وأثر توسع النطاق

## 26.1 Original v1 baseline (US $10,000)

The allocation below was prepared for the version 1.0 scope (a single-owner store with basic stock and COD). It is kept for reference.

| Work stream | Allocation (USD) | Share |
|---|---|---|
| Discovery & UI/UX design | $1,200 | 12% |
| Backend API + admin | $3,000 | 30% |
| Mobile app (Flutter) | $2,800 | 28% |
| Web storefront (Next.js) | $1,500 | 15% |
| QA & testing | $700 | 7% |
| DevOps, deployment & setup | $500 | 5% |
| Project management & documentation | $300 | 3% |
| TOTAL | $10,000 | 100% |

## 26.2 Scope impact of versions 4.0 and 5.0

The approved requirements add an operational and accounting layer that was not part of the v1 baseline: fine-grained access control, lot-level inventory with FIFO/FEFO and weighted-average costing, supplier accounts with multi-currency purchasing, delivery-party custody and external drivers, agent wages and netting, a double-entry ledger with monthly close, expenses, pricing protection and a full report set — plus a separate Web Admin application to operate all of it. By the document author's estimate this roughly doubles the backend and makes the Web Admin the largest front-end deliverable. This is an engineering estimate for planning — not an approved cost, budget or date.

- Recommendation: the owner and client re-agree budget and timeline against the v5 scope before Milestone B, rather than discovering the size mid-way.
- The phased plan keeps a working, sellable system at every milestone, so priorities can be adjusted without leaving half-built modules.
- Recurring costs remain separate and borne by the client: hosting/VPS, domain, SMS/OTP credits, app-store fees (Apple US$99/year, Google US$25 one-time), backups and monitoring.
الملخص

وُضعت ميزانية 10,000 دولار لنطاق الإصدار الأول (متجر بمخزون بسيط ودفع عند الاستلام) وتبقى للمرجعية. أضاف الإصداران 4.0 و5.0 طبقة تشغيلية ومحاسبية كاملة ولوحة إدارة مستقلة، ما يضاعف تقريبًا حجم الخلفية ويجعل لوحة الإدارة أكبر عمل واجهات. نوصي بإعادة الاتفاق على الميزانية والجدول الزمني مع العميل وفق نطاق الإصدار 5 قبل المحطة (ب). التكاليف المتكررة منفصلة ويتحملها العميل.

# 27. Team & Engineering Workflow

الفريق وسير العمل الهندسي

## 27.1 Team

| Role | Responsibility |
|---|---|
| Backend & web lead | Owns the API, contract and Next.js apps; drives AI coding agents (backend and front end) and reviews every pull request. |
| Mobile developer | Flutter app for customers, delivery agents and order monitors; integrates each backend phase. |
| AI coding agents | Implement one scoped task per pull request against the contract, with migrations and tests; never merge red CI. |
| Store owner / client | Approves requirements and decisions, assigns permissions, runs UAT. |

## 27.2 Workflow rules

- Single trunk: short-lived feature branch off main → pull request into main → all CI checks green → merge → delete the branch. Only main lives long.
- One agent per working copy: parallel agents work in separate clones or worktrees so they never collide in one folder.
- Contract first: api/openapi.yaml is updated in the same pull request as the behaviour, with a changelog entry; client types are regenerated and must show zero drift.
- CI gates: OpenAPI lint, schema drift check, unit tests, real-database acceptance on a uniquely named throwaway database that is dropped afterwards, web mock and live suites (rate-limit-safe, a missing API fails rather than skips).
- Scope discipline: agents do not rename shipped vocabulary or change behaviour outside the task; anything extra is proposed, not slipped in.

# 28. Risks & Mitigations

المخاطر وإجراءات التخفيف

| Risk | Impact | Mitigation |
|---|---|---|
| Scope growth vs. original budget | Delays, budget overrun | Re-agree budget and timeline against v5; milestones A/B/C each leave a working system; change control on new requirements. |
| Accounting errors (double counting, drift) | Wrong profit, cash or stock values | One balanced ledger; append-only documents; automated reconciliation of stock, parties, suppliers and cash to the ledger; the team's numeric acceptance examples as tests. |
| Concurrency on stock and cash | Overselling, double settlement | Row locks inside transactions; idempotency and operation keys; tests for simultaneous orders, receipts, netting and refunds. |
| Cash held by delivery parties / external drivers | Losses, disputes | Separate goods and cash custody, numbered vouchers, no closing by notice or photo, exceptions stay visible, separation of duties, ageing in reports. |
| Exchange-rate mistakes | Wrong costs or prices | Explicit rate direction, no default rate, history and warnings, preview before linked-price publish, historical values never rewritten. |
| Data migration at go-live | Wrong opening stock or balances | Opening-balance documents with reconciled quantities, values and supplier balances; no assumed zero cost; dev data is disposable. |
| Interface/role leaks | Unauthorised changes | Surface-bound tokens, deny-by-default routes, authorization matrix in CI, work accounts blocked from shopping in the API. |
| Agent scope creep | Unrequested breaking changes | Tight task prompts, contract-first reviews, CI gates, reverting anything outside scope. |
| Key-person dependency | Continuity | This document, the contract, ADR-style decision log, tests and CI. |
| Third-party services (SMS, push, hosting) | Sign-in or notification outages | Provider abstraction, dev modes, monitoring, fallbacks where possible. |

# 29. Acceptance Criteria

معايير القبول

Before delivery, the following are automated as tests (and walked through in UAT). Quantities, values and document totals must reconcile automatically; posting and correction features are not delivered until their tests pass.

| Area | Must be proven |
|---|---|
| Access & interfaces | Work roles separated from shopping; order-monitor edits refused; agent limited to delivery tasks; phone role assigned by server; permission changes effective immediately; transitions refused without permission; notification read state synced between phone and web; existing Flutter pagination and chips behaviour preserved. |
| Orders & stock | Competition for the last units (5 available, 2 × 3 ordered at once); no duplicate on re-submit; correct reserve, release, issue and lot selection (FIFO/FEFO); reservation moved off a damaged lot; failed delivery and retry without a second issue; acceptance timeout outside business hours; acceptance racing auto-cancel; draft restore without stock effect; negotiation disabled in all interfaces and API, with old negotiation reservations released. |
| Purchasing & costing | Same product at different costs; purchase between two issues keeps the first issue cost; reserved included in book quantity; cartons to pieces with correct unit cost; one item split over two locations; landed-cost allocation and rounding differences; zero balance then new purchase; partial return after the average changed; supplier return with value difference; cost correction after partial issue; transfer keeps total value; price change while a cart or earlier order exists. |
| Currencies | Local purchase without conversion; foreign purchase with fixed rate and local landed cost without double conversion; central rate update without changing history or past orders; rate-only save vs linked-price publish; unlinked products unchanged; price up and down with rounding after conversion; stale preview refused; missing, zero or wrongly-directed rate refused; return after rate change; consistent currency code on phone, web and documents; test store with another base currency and no code change. |
| Suppliers & operations | Cash, credit and partial purchases; one payment for several invoices; overpayment as supplier credit; foreign debt paid in IQD with correct FX difference; supplier return before and after payment; payment reversal without stock change; supplier statements reconcile; count running concurrently with stock movement. |
| Custody & returns | 150,000 / 120,000 / 30,000 example; several payments per order and several orders per payment; unallocated receipt then allocation without a second receipt; partial reversal of a voucher or allocation; two staff settling the same collection; agent cannot approve their own handover; reassignment without moving past cash; pending bank transfer; short collection after real delivery; refunds before and after settlement, from the store's cash and from custody; successive returns with rounding, points and delivery fees; two concurrent refunds — no amount doubled or lost. |
| Wages & netting | Salary only, per-order only, both; partial month and mid-month change without overlap; no duplicate payroll; success, failure then success, and re-sent delivery update give one accrual; rate change does not recalculate the past; custody transfer without double success wage; later return keeps a valid wage; examples A–D; wage paid in instalments; salary and several wages netted against several collections; no side exceeded; refund racing netting, concurrent payments and lost connection during approval without duplication; netting reversal without phantom cash; correction of an accrual already paid; refusal without permission or in one's own favour; period close respected; statement reconciles with the ledger, cash and expense reports. |
| External drivers | Full trip from Web Admin for a driver without an account; delivery with unconfirmed collection confirmed later without phantom cash or double collection; short and excess collection; re-sent actions; examples 1–3; prepaid fare not deducted twice; customer-paid fare outside store accounts; one payment across several trips; multi-order trip with mixed outcomes without duplicate fare, issue or assumed collection; cancellation after dispatch with partial/full return; return after settlement; refund from cash box vs from driver custody; driver change without moving custody; disabling a record keeps its debt; permissions, close, concurrency and report reconciliation. |
| Close & expenses | Payment of 150,000 over several lists then correcting one without changing the payment; correcting a fully paid list creates a store credit; allocation reversal without new payment; accrued expense partly paid then settled next month; prepaid expense over several periods; freight and supplier payments not duplicated as expenses; owner drawings excluded from profit; closed-period edits refused; payment or return for an old invoice without changing the past "as of" report; next-period opening reconciles; reopening with permission and difference log; profitability, cash and liabilities reconcile to the ledger with drill-down. |
| SKUs & quantities | Two variants of one product bought at different costs keep separate averages, reference costs and prices; buying one never changes the other; when the requested variant runs out the other is never reserved automatically. A weight SKU: buy 2.5 kg, reserve and sell 0.75 kg, return 0.25 kg — balance, cost and rounding reconcile. Low stock shows for 0.5 kg when the threshold is 1 kg. Piece SKUs refuse fractions. |
| Postings & corrections | Every scenario in section 17.1 balances: full, short and unconfirmed collection, later confirmation without a second sale, exception resolved by handover or approved loss, return set against an uncollected part, delivery-fee refund as a separate line, FX loss and FX gain. A purchase cost correction while part of the quantity is in the warehouse, part in delivery custody and part delivered, followed by part of the custody coming back: the effect is split correctly, never charged to cost of sales for undelivered goods, and never applied twice. |
| Retrieval & delivery charges | Cancellation after dispatch with partial return, full return, and a missing quantity: custody closes only when every quantity is settled; no automatic charge to the party. Goods returned after a failed delivery are re-reserved and the next handover is a new issue. A customer-paid driver fare with a store delivery fee on the same delivery is refused at order creation and at a change of delivery method; changing an existing order's delivery agreement requires the customer's documented acceptance before dispatch. |
| Field protection | Selling below reference with and without exception; discount + points + rounding causing a loss; cost rise between orders; exception expiring or its quantity used concurrently; future-dated invoice; invoice older than the window; date inside a closed period; document before system start; valid future due and expiry dates allowed; extra zero, negative, missing or huge values; Arabic/English digits and separators; pack vs piece price; attempts to edit totals or pass exceptions through the API or imports refused; clear messages, inputs kept, nothing partially posted. |

الملخص

تُؤتمت اختبارات القبول التي حددها الفريق قبل التسليم وتُراجع في اختبار المستخدم: فصل أدوار العمل عن التسوق ومنع تعديل حساب المتابعة، والتنافس على آخر كمية، ومنع التكرار، وصحة الحجز والصرف واختيار الدفعات، واختبارات الكلفة والعملات والمورّدين والعهد والمرتجعات والأجور والمقاصة والسائق الخارجي والإقفال والمصاريف وحماية الحقول. يجب أن تتطابق الكميات والقيم وإجماليات المستندات آليًا، ولا تُسلم وظائف الترحيل والتصحيح قبل نجاح اختباراتها.

# 30. Current Build Status

حالة البناء الحالية

Status on main at the time of writing (contract v5.5.0), taken from the merged pull-request reports and their CI runs. Live-verified = implemented and confirmed end to end against the real database with mocks off; Planned = specified in this document, implementation pending. A requirement written here is not evidence that it is implemented: acceptance is tied to actual test results and the exact build that was tested.

| Capability | Status | Notes |
|---|---|---|
| Phone OTP auth, JWT, /me, RBAC (v1) | Live-verified | Dev OTP mode; role model to be replaced by Phase 1 access model. |
| Catalog, media, banners, scheduled discounts | Live-verified | Media on SeaweedFS (S3) after the gated MinIO image was replaced. |
| Addresses (E.164 contact phone) | Live-verified | Ownership and default-address rules. |
| Server-priced cart, coupons (apply/remove) | Live-verified | Guest cart replayed once at sign-in. |
| COD checkout, orders, snapshots | Live-verified | Idempotent placement; immutable price, product and address snapshots; variant-level stock hold (to become lot-level). |
| Admin order processing | Live-verified | pending → confirmed → preparing → ready_for_dispatch → dispatched; stock hold deducted at dispatch or released on cancel; COD reconciled on delivery (to be replaced by collections and custody). |
| Deliveries + delivery rating | Live-verified | Assignment-scoped agent transitions; failed currently terminal (retry planned). |
| Returns v1 | Live-verified | Partial returns, staff inspection, restock of sellable items, COD refund obligation from snapshot prices. |
| Loyalty v1 | Live-verified | Ledger-based balance, earn once on delivery, redeem; no clawback on returns (superseded by v5). |
| Reviews (write, moderate, own reviews) | Live-verified | Verified purchase, pending by default, approved-only public aggregates. |
| Notifications v1 | Live-verified | Device tokens, 10 types × 2 channels preferences, queued fan-out through a dev provider. |
| Wishlist | Live-verified | Idempotent add, server pricing, effective category visibility. |
| Web storefront | Live-verified | Every customer domain on real data; mock suite and live suite green. |
| Access model v2, monitor orders, inbox & read sync | Planned | Phases 1–2. |
| Financial core, catalog v2, lots & costing, purchasing, custody, returns v2, wages, expenses, reports | Planned | Phases 3–12. |
| Web Admin application | Planned | Starts after Phase 1. |

## 30.1 Already-built parts that change under v5

- Loyalty: returns must now reverse earned points and restore used points.
- Negotiation fields added in the loyalty slice: the feature is removed from UI and API; old requests closed, their reservations released.
- Money: every amount gains a currency code with IQD as base; seed prices re-seeded in realistic dinar values.
- Deliveries: failed becomes retryable; cancellation after dispatch goes through retrieval and inspection; order gains "rejected".
- Stock hold and COD "paid": replaced by lot-level reservation, handover into custody, recorded collections and settlement.
- Returns: refunds from per-unit shares, separate refund vouchers and states, delivery-fee policy.
- Notifications: saved inbox, read-state sync across devices, live web updates, admin events.

## 30.2 Progress estimate

Author's engineering estimate, for planning only (not an approved cost or date): under the v5 scope, roughly one-third of the backend is built; about two-thirds remains, led by the accounting core, suppliers and purchasing, reports, delivery custody and wages, and the lot-based order lifecycle. The Web Admin is the largest remaining front-end piece. Launch operations (production SMS/OTP gateway, hosting with TLS and domain, production object storage, backups and monitoring, security and performance pass, UAT, app-store submission) are tracked separately.

# 31. Revision History & Decision Log

سجل الإصدارات والقرارات

| Version | Date | Summary |
|---|---|---|
| 1.0 | Aug 2026 | Initial analysis, stack and UML diagrams (single-owner store, COD). |
| 2.0 | Aug 2026 | Team-review architecture: white-label, RBAC, suppliers/batches/FEFO, returns, loyalty, ratings, audit. |
| 3.0 | Sep 2026 | Reconciled with real integration: NestJS/Prisma/JWT stack, price + discount model, immutable order snapshots, build status. Contract v4.5.0. |
| 4.0 | Sep 2026 | Approved modifications and the team's answers to the eight decisions: interface split and Next.js Web Admin, one role per phone, per-action permissions, monitor read-only, notification center, lot-level reservation, two-level categories and brands, purchasing with mandatory supplier and currencies, moving weighted-average costing, supplier accounts, delivery custody, returns v2, ledger, expenses, monthly close, protections, reports; delivery-agent wage and netting policy. |
| 5.0 | Sep 2026 | External-driver addendum (drivers without accounts, trips, fares, staff-recorded events, settlement and netting) integrated; full document restructure; diagrams updated and extended (20 diagrams). Contract v5.5.0 on main. |
| 5.1 | Sep 2026 | Team review of v5.0 applied: supplier FX example corrected; stock item defined as the SKU (variant-level costing and reservation); exact decimal quantities; balanced posting scenarios for short and unconfirmed collections, returns and FX; cost corrections split across warehouse, custody and sold quantities; Release 1 vs build phases and a Release 1 gate; explicit no-double-delivery-charge rule; retrieval document for goods returning after dispatch; blank pages removed and wide diagrams on landscape pages; Markdown text companion added. |

## 31.1 Decision log

| # | Decision | Replaces |
|---|---|---|
| D-01 | Flutter only for iOS/Android; no Flutter Web anywhere. | Flutter Web admin (v2–v3). |
| D-02 | Web Admin is a separate Next.js app in admin/ on its own subdomain; the only place for admin actions. | Admin inside the mobile app. |
| D-03 | Web Admin uses username + password; mobile and web store use phone OTP. | Phone OTP for everyone. |
| D-04 | One role per phone (customer / agent / monitor), pre-set from the Web Admin; work accounts cannot shop, also on the web store. | Role-based single app with switchable modes. |
| D-05 | Order monitor: read-only orders with chips, search, date range and server-side pagination; no product images in detail; notifications for new, cancelled and failed. | Mobile admin with edit actions. |
| D-06 | Per-action permissions with presets, effective immediately; no self-approval. | Coarse permissions (e.g. orders.manage). |
| D-07 | Categories limited to two levels; brands as an independent entity. | Unlimited category hierarchy. |
| D-08 | Stock reserved at successful order creation, per lot and location; out_for_delivery = handover into custody. | Reservation at acceptance; deduction at dispatch. |
| D-09 | Location = warehouse + location code (+ description). | Warehouse → zone / aisle / shelf / bin. |
| D-10 | Supplier mandatory on purchases; unit cost required; cash, credit and partial payment. | Optional supplier; cost-light receipts. |
| D-11 | Foreign purchase currencies with manual central rates; optional currency-linked selling prices. | IQD-only purchasing. |
| D-12 | Moving weighted-average valuation; FIFO/FEFO chooses the lot. | Per-batch cost with average for reference. |
| D-13 | Returns reverse earned points and restore used points. | No clawback of points on returns (v1 loyalty). |
| D-14 | Price negotiation removed entirely. | Negotiation data model (is_negotiable, floor, points price). |
| D-15 | Double-entry ledger, expenses and manual monthly close required in Release 1 (the team's «المرحلة الأولى»). | Not in scope. |
| D-16 | Delivery wages: optional salary and/or per-delivery fee, versioned; explicit authorised netting. | Not defined. |
| D-17 | External drivers without accounts; trips and fares; staff record events on their behalf. | Registered agents only. |
| D-18 | Order status names kept where meaning is unchanged (contract v5.4.0 names); additions only. | — |
| D-19 | Object storage on SeaweedFS (S3-compatible). | MinIO (image no longer pullable). |
| D-20 | The stock item is the SKU (variant): balances, reservations, average and reference cost, prices and thresholds per SKU. | Product-level cost wording (v5.0). |
| D-21 | Quantities are exact decimals in the SKU's base unit; whole numbers enforced for piece SKUs. | Integer quantity fields (v5.0 diagrams). |
| D-22 | Goods coming back after dispatch are tracked by a separate retrieval document; the order shows cancelled or ready_for_dispatch. | retrieval / returned_to_store as order states (v5.0). |
| D-23 | "Release 1" = first operational release; "Phase 1–13" = build phases; milestones are internal. | Ambiguous use of "phase 1". |

# 32. Appendix: Glossary

ملحق — مسرد المصطلحات

| Term | Meaning |
|---|---|
| COD | Cash on Delivery — the customer pays when the order is delivered. |
| OTP | One-Time Password sent by SMS to verify a phone number. |
| Surface | Where a session comes from: admin (Web Admin password) or app (phone OTP from mobile or web store). |
| Work account | A phone registered as delivery agent or order monitor; it sees only work pages and cannot shop. |
| Order monitor | A read-only admin role on the phone or web store for following orders and receiving notifications. |
| Preset | A named group of permissions assigned to staff for convenience. |
| Lot (دفعة) | Stock received together in one purchase line, with its own cost, receipt date, expiry and per-location balances. |
| FIFO / FEFO | First-In-First-Out (oldest received first) / First-Expiry-First-Out (nearest expiry first). |
| Reservation | Stock held for a created order at a specific lot and location, reducing available-for-sale without issuing it. |
| Issue (صرف) | Goods leaving a location — here, at handover into delivery custody at a fixed cost. |
| Custody (عهدة) | Goods or cash held by a delivery party on behalf of the store until delivered, returned or handed over. |
| Collection exception | A difference between the amount due and the amount actually collected, kept open for investigation. |
| Netting (مقاصة) | Settling wages or fares owed to a delivery party against an equal amount of collection cash they hold, without cash passing through the store's box. |
| Voucher (سند) | A numbered, posted financial document (receipt, payment, netting, refund) that can only be reversed, never edited. |
| Moving weighted average | Stock value per unit recalculated on every receipt from total value ÷ total quantity. |
| Landed cost | Costs to bring goods into the warehouse (e.g. transport) added to their inventory cost. |
| Reference cost | The higher of average cost and last landed purchase cost, used to protect against selling below cost. |
| External driver | A driver or taxi without an app account, recorded as a delivery party; staff record events on their behalf. |
| Trip | A numbered delivery run by an external driver covering one or more ready orders, with one fare agreement. |
| Period close | Manual monthly lock after review; nothing can be posted inside a closed period without the reopen exception. |
| Idempotency / operation key | A key that makes a repeated request return the same result instead of acting twice. |
| Snapshot | Price, product and address details frozen onto an order at placement. |
| Gross profit | Net sales minus cost of sales — not net profit, which also needs expenses and other items. |
| SSE | Server-Sent Events — a live stream the server uses to push notifications to open web pages. |
| SeaweedFS | The S3-compatible object store holding product, category and banner media. |

— End of document —  ·  نهاية الوثيقة —
