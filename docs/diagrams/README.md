# Shubayr — Diagrams

All UML & system diagrams, each in three formats:

- **`.png`** — view.
- **`.svg`** — edit as vector (Figma / Illustrator / Inkscape / browser).
- **`.mmd`** — edit the source. Easiest: paste into <https://mermaid.live>, edit, re-export.

If you change a diagram's logic, edit the `.mmd` first, then re-export the PNG/SVG.

| File | Shows |
|---|---|
| 01_System_Architecture | Apps, API, data stores & services |
| 02_Use_Case | Actors and their actions |
| 03_Class_Commerce | Commerce domain model |
| 04a_ER_Commerce_Core | DB: users/RBAC, catalog, orders, loyalty, ratings |
| 04b_ER_Inventory_Supply | DB: suppliers, batches, locations, movements, reservations, returns |
| 05_Sequence_Checkout_COD | Placing a Cash-on-Delivery order |
| 06_Sequence_Login_OTP | Phone + OTP auth |
| 07_Sequence_Order_Tracking | Status updates + notifications |
| 08_Activity_Shopping_to_Order | Customer journey |
| 09_State_Order_Lifecycle | Order status machine |
| 10_Component | Software components |
| 11_Deployment | Runtime infrastructure |
| 12_Class_Inventory_Supply | Inventory & supply-chain domain |
| 13_Sequence_Goods_Receipt | Purchase invoice → batches → locations |
| 14_Sequence_Reservation_FEFO | Reservation, FEFO picking, deduction |
| 15_Activity_Returns | Partial, condition-based returns |
