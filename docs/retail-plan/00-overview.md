# 00 — Overview: where IQ POS is today, decisions, hardware, rules

Part of the [retail plan set](README.md). Everything in §1 was checked in the code (2026-11-01).

## 1. What the platform does today

| Area | Today | Why it matters for shops / warehouses |
|---|---|---|
| Business type | `restaurants.businessType` = `"restaurant" \| "cafe"` (`db/schema.ts`, `lib/types.ts`). Set in Super Admin → create (`app/super-admin/create-restaurant-form.tsx`, `createRestaurantAction` in `lib/actions/restaurants.ts`) and Settings → Restaurant (`updateBusinessTypeAction`). Only effect: a cafe's fully paid new order skips "In Kitchen" (`placeOrderAction`, `lib/actions/orders.ts`). | Needs Grocery / Retail / Warehouse, and the type must switch whole areas on and off. |
| Products | Table `dishes`: name, price, emoji, colour, photo, category, `channelPrices`, `outOfStock`, one optional stock link (`inventoryItemId` + `inventoryUsagePerOrder`). Tax rate is per category. Actions in `lib/actions/menu.ts` (`createDishAction`, `updateDishAction`, …), screen `app/manage-dishes/`. | No barcode, SKU, cost, unit of sale, weight, VAT override, minimum age, variants, supplier. |
| Order lines | `OrderItem` (`lib/types.ts`): dishId, name, price, qty (a number — decimals are *possible* but nothing uses them), note, lineId, taxRate, ready, changed/prevQty. | Needs unit, weight, barcode/variant info per line. |
| Money | Line totals are `price * qty` with **no rounding**, written out in 24 places across 12 files (`orderBreakdown` in `lib/types.ts`, the Till, Simple Till, kiosk, online order, invoice, reports, `escpos-ticket.ts`, `print-ticket.ts`, `placeOrderAction`). | 0.734 kg × £2.40 = £1.7616 — totals would carry fractions of a penny. Fix once (step 0.1). |
| Stock | `inventory_items`: name, free-text unit ("pcs"), quantity, low-stock threshold. `/inventory`: add, edit, ± adjust, delete (`lib/actions/inventory.ts`). | No history, no goods in, no stocktake, no cost, no locations, no batches. |
| Stock going down | `decrementInventoryForOrder()` (`lib/order-helpers.ts`) once, when a new order is placed; clamps at 0. | Not returned on void (`lib/actions/orders.ts` void/reject, `autoVoidStaleOrders` in `lib/data/orders.ts`), Till edit, or Sales Records delete/edit (`lib/actions/sales-records.ts`). Oversells are hidden. |
| Till | Tap tile to add, − / + whole units, custom item, Cash / card machines, split bill. Tables, guests, channels Dine in / Wait List / Take Away / Delivery / Online / Third Party. | No scanning, weight, refunds, age check, price override. |
| Receipts | `escpos-ticket.ts` prints `"2x Name"`; footer default "Thank you for dining with us!". | Weighed lines need `0.734 kg @ £2.40/kg`; retail wording. |
| Reports | `report-insights.ts` adds up `qty` as "items sold". | Kilograms and items can't be added together — split by unit. |
| Customers | No customers table — `/customers` is built from orders + `loyalty_members`. | Trade accounts need their own table. |
| Multi-site | Regional admins see assigned sites (`restaurant_access`). Each site has its own menu and stock. | No shared catalogue, transfers or combined reports. |
| Plans | Website Pricing page (`lib/site/pricing.ts`) promises live stock control, multi-site reporting & central menus, supplier ordering & integrations, till limits. | Supplier ordering, central menus and till limits don't exist yet (steps 4.4–4.5, 6.7, 6.8). |

## 2. Decisions needed

Answer these before Phase 1; the plan assumes the **bold** default if not.

1. Warehouse: sells (cash & carry / wholesale) or only stores & dispatches? — **both, switchable**.
2. Loose goods by weight? — **yes; typed weight first, embedded barcodes next, scales last**.
3. Expiry dates / batches? — **warehouse yes, grocery optional**.
4. Sell when stock shows 0? — **allow with a warning for shops, block for warehouses** (setting, step 0.4).
5. Products per shop? — **plan for 10,000**: CSV import and search-first Till are required.
6. Promotions (multi-buy, meal deals)? — **yes, Phase 5**.
7. General retail: variants (size/colour)? serial numbers? — **variants yes, serials optional**.
8. Weight units shown — **kg and g** (lb/oz available as a setting for imported goods).

## 3. Hardware

| Device | Use | How it connects | Step |
|---|---|---|---|
| Barcode scanner (USB / Bluetooth, "HID keyboard" mode) | Till scanning, goods in, stocktake | Types the code + Enter like a keyboard — no driver | 3.1 |
| Tablet / phone camera | Scanning without a scanner | Browser `BarcodeDetector` (Chrome/Android) or a JS decoder | 3.9 |
| Labelling scale (prints price-embedded barcodes) | Deli / butcher / loose veg packed in back | Nothing to connect — the Till reads the barcode | 3.2 |
| Counter scale (trade-approved) | Weigh at the till | Typed weight first; Web Serial (Chrome on a PC) or a Sunmi terminal with built-in scale later | 3.3, 3.10 |
| Receipt printer | Receipts, refund slips, cash drawer kick | Existing network/bridge printing (§7.8 of the guide) | 7.2 |
| Label printer (Zebra / Brother / Dymo) | Shelf-edge and product labels | Print bridge, label language (e.g. ZPL); A4 label sheets work with no printer setup | 2.6, 7.3 |
| Handheld PDA / phone | Picking, stocktake in aisles | The web app on a phone | 4.6, 6.3 |

## 4. UK rules to keep in mind (check with an adviser)

- **VAT** — most food is zero-rated; confectionery, crisps, soft drinks, alcohol, hot food are
  standard-rated → per-product VAT override (2.3).
- **Selling by weight** — scale must be trade-approved (NAWI); sell in metric (imperial can be shown alongside).
- **Price marking** — shelf labels show the unit price (per kg / per litre / per 100 g) for goods
  sold by weight or volume (2.6).
- **Age-restricted products** — alcohol, tobacco & vapes, knives, solvents, some medicines, lottery:
  Challenge 25 prompt and a refusals log (3.5).
- **Food labelling** — food packed on site for direct sale (PPDS) needs full ingredients/allergens.
- **Less-healthy food promotions (HFSS)** — restrictions apply to larger businesses; check before
  enabling multi-buys on those products (5.3).
- **Consumer rights** — refunds/exchanges policy printed on receipts (3.7).
