# Grocery shops & warehouses on IQ POS — plan

Status: **plan only, nothing built yet** (written 2026-11-01). When work starts, each phase gets
its own changelog entry in `DEVELOPER_GUIDE.md` §14, FAQ answers, and the SQL below moves from
"draft" to "run on Turso".

## 1. What the platform does today (the starting point)

Everything below was checked in the code, not assumed.

| Area | Today | Why it matters for a shop / warehouse |
|---|---|---|
| Business type | `restaurants.businessType` is `"restaurant" \| "cafe"` (`db/schema.ts`, `lib/types.ts`). Chosen in Super Admin → create restaurant (`create-restaurant-form.tsx`, `createRestaurantAction`) and Settings → Restaurant (`updateBusinessTypeAction`). Its **only** effect: a cafe's fully paid new order skips "In Kitchen" (`lib/actions/orders.ts`). | Needs `grocery` and `warehouse`, and the type has to switch whole areas of the app on/off, not just one rule. |
| Products | `dishes`: name, price, emoji, colour, photo, category, per-channel prices, an `outOfStock` flag, and **one** optional inventory link (`inventoryItemId` + `inventoryUsagePerOrder`). Tax rate is per **category**. | No barcode, SKU, cost price, unit of sale (each / kg / litre), sold-by-weight, pack size, supplier or age restriction. |
| Stock | `inventory_items`: name, free-text unit (default "pcs"), quantity, low-stock threshold. `/inventory` page: add, edit, ± adjust, delete. | No history of *why* stock changed, no goods-in, no stocktake, no cost, no locations, no batches/expiry. |
| Stock going down | `decrementInventoryForOrder()` (`lib/order-helpers.ts`) runs once when a new order is placed. Clamps at 0. | Not put back on void, Till edit or Sales Records delete; an edit that adds items doesn't take more stock; overselling is hidden by the clamp. (Already listed in §13.3.) |
| Till | Tap a tile to add, − / + by whole units; custom item with any price; Cash or card machine; split bill. Tables, guests, Dine in / Wait List / Take Away / Delivery / Online / Third Party. | No barcode scanning, no weighed items, no refunds/returns, no age check, no "price reduced" override, restaurant channels. |
| Kitchen | Kitchen Display, kitchen timer, ticket printing to stations, reservations, Manage Table, table QR ordering. | Not needed for a shop. A warehouse could reuse the Kitchen Display as a **picking screen**. |
| Wording | "Manage Dishes", "Restaurant", "Thank you for dining with us!" (receipt footer default), "Kitchen Speed" / "Tables" reports. | Must read "Products", "Store", "Thank you for shopping with us!". |
| Multi-site | Regional admins see the restaurants assigned to them (`restaurant_access`). Each site has its own menu and stock. | No shared product catalogue, no stock transfer between sites, no combined reports. |
| Plans | The website Pricing page (`lib/site/pricing.ts`) promises "live stock control", "Multi-site reporting & central menus", "Supplier ordering & integrations" and till limits. | Supplier ordering, central menus and till-licence limits **don't exist yet**; live stock is partial. Either build them (phases below) or soften the wording. |

## 2. Decisions needed before building

1. **Warehouse = what?** Cash-and-carry / wholesale that sells (needs the Till and trade customers),
   or storage & dispatch only (goods in, picking, delivery notes, no till)? Possibly both.
2. **Weighed goods** (loose fruit & veg, deli)? Start with typing the weight; later connect a
   scale. Selling by weight in the UK needs a trade-approved (certified) scale.
3. **Barcode scanners**: USB/Bluetooth scanners work with no driver (they type like a keyboard).
   Tablet camera scanning is a nice extra.
4. **Expiry dates / batches** needed (fresh food, pharmacy-type goods), or just quantities?
5. **Allow selling below zero stock?** (Shops usually allow it and flag it; warehouses usually block.)
6. **Product counts**: hundreds or thousands? Thousands means CSV import and search-first Till are required, not optional.
7. **Promotions**: multi-buy ("3 for £2"), meal deals, reduced-to-clear?

## 3. How the business type should work

One new file, `lib/business-profile.ts`, so every screen asks one place instead of checking the type itself:

```ts
type BusinessType = "restaurant" | "cafe" | "grocery" | "warehouse";
businessProfile(type) → {
  labels:   { products: "Products" | "Dishes", place: "Store" | "Restaurant", receiptFooter, ... },
  features: { tables, kitchenDisplay, reservations, tableQr, barcode, weighedItems,
              stockTracking, suppliers, locations, batches, tradeAccounts, picking },
  channels: ["Counter", "Collection", "Delivery", "Online"] | restaurant channels,
  defaultCategories: [...],   // seeded on create
}
```

Defaults per type (owner or Super Admin can override per store in a `restaurants.features` JSON column):

| Feature | Restaurant | Cafe | Grocery | Warehouse |
|---|---|---|---|---|
| Tables, guests, reservations, table QR | ✓ | optional | ✗ | ✗ |
| Kitchen Display / kitchen tickets | ✓ | ✓ | ✗ | as **Picking** screen |
| Barcode scanning on the Till | optional | optional | ✓ | ✓ |
| Weighed items | ✗ | ✗ | ✓ | optional |
| Stock per product (sell 1 → stock −1) | via ingredients | via ingredients | ✓ | ✓ |
| Suppliers & purchase orders | optional | optional | ✓ | ✓ |
| Locations / bins, batches & expiry | ✗ | ✗ | optional | ✓ |
| Trade accounts (credit, invoices) | ✗ | ✗ | optional | ✓ |
| Age-restricted sale prompt | bar only | ✗ | ✓ | optional |

Seeded categories for a new grocery store (with UK VAT defaults — food mostly 0%, check per product):
Fruit & Veg, Bakery, Dairy & Eggs, Meat & Fish, Frozen, Cupboard, Drinks, Snacks & Sweets,
Alcohol, Household, Health & Beauty. (Confectionery, crisps, soft drinks and alcohol are 20%,
which is why a **per-product VAT override** is needed on top of the category rate.)

## 4. Data model changes

Draft SQL — **not run yet**. Columns are added, never removed, so restaurants keep working.

```sql
-- Products: retail fields on the existing dishes table
ALTER TABLE dishes ADD COLUMN sku text;
ALTER TABLE dishes ADD COLUMN barcode text;                 -- EAN-13 / UPC / internal
ALTER TABLE dishes ADD COLUMN cost_price real;              -- for margin & stock value
ALTER TABLE dishes ADD COLUMN sell_by text NOT NULL DEFAULT 'each';  -- each | kg | g | l
ALTER TABLE dishes ADD COLUMN tax_rate_override real;       -- null = use category rate
ALTER TABLE dishes ADD COLUMN min_age integer;              -- 18 for alcohol/tobacco, 16 for knives…
ALTER TABLE dishes ADD COLUMN pack_size real;               -- e.g. case of 12 (warehouse)
ALTER TABLE dishes ADD COLUMN supplier_id text;
CREATE UNIQUE INDEX dishes_restaurant_barcode_idx ON dishes (restaurant_id, barcode) WHERE barcode IS NOT NULL;

-- Per-store switches on top of the business-type defaults
ALTER TABLE restaurants ADD COLUMN features text;           -- JSON, e.g. {"tables":false}

-- Stock: keep inventory_items as the one stock engine; add cost and reorder levels
ALTER TABLE inventory_items ADD COLUMN cost_price real;
ALTER TABLE inventory_items ADD COLUMN reorder_level real;
ALTER TABLE inventory_items ADD COLUMN reorder_qty real;

-- Every stock change, with the reason — the audit trail and the source for stock reports
CREATE TABLE stock_movements (
  id text PRIMARY KEY, restaurant_id text NOT NULL, inventory_item_id text NOT NULL,
  change real NOT NULL,                                     -- + in, − out
  reason text NOT NULL,   -- sale | void | edit | refund | received | adjust | count | waste | transfer_in | transfer_out
  reference_id text,                                        -- order / purchase order / count / transfer id
  location_id text, batch_id text, unit_cost real,
  created_by_name text, created_at integer NOT NULL
);
CREATE INDEX stock_movements_item_idx ON stock_movements (restaurant_id, inventory_item_id, created_at);

CREATE TABLE suppliers (
  id text PRIMARY KEY, restaurant_id text NOT NULL, name text NOT NULL,
  contact_name text, email text, phone text, account_ref text, lead_time_days integer, notes text,
  created_at integer NOT NULL
);

CREATE TABLE purchase_orders (
  id text PRIMARY KEY, restaurant_id text NOT NULL, supplier_id text NOT NULL,
  number text NOT NULL, status text NOT NULL DEFAULT 'draft',  -- draft | sent | part_received | received | cancelled
  expected_at integer, notes text, created_by_name text, created_at integer NOT NULL
);
CREATE TABLE purchase_order_lines (
  id text PRIMARY KEY, purchase_order_id text NOT NULL, inventory_item_id text NOT NULL,
  qty_ordered real NOT NULL, qty_received real NOT NULL DEFAULT 0, unit_cost real
);

CREATE TABLE stock_counts (            -- stocktakes
  id text PRIMARY KEY, restaurant_id text NOT NULL, status text NOT NULL DEFAULT 'open',
  location_id text, started_by_name text, created_at integer NOT NULL, closed_at integer
);
CREATE TABLE stock_count_lines (
  id text PRIMARY KEY, stock_count_id text NOT NULL, inventory_item_id text NOT NULL,
  expected real NOT NULL, counted real
);

-- Warehouse only (phase 3)
CREATE TABLE stock_locations (id text PRIMARY KEY, restaurant_id text NOT NULL, code text NOT NULL, name text, kind text);  -- zone / aisle / bin
CREATE TABLE stock_levels (inventory_item_id text NOT NULL, location_id text NOT NULL, quantity real NOT NULL DEFAULT 0, PRIMARY KEY (inventory_item_id, location_id));
CREATE TABLE stock_batches (id text PRIMARY KEY, inventory_item_id text NOT NULL, location_id text, lot text, expires_on text, quantity real NOT NULL);
CREATE TABLE stock_transfers (id text PRIMARY KEY, from_restaurant_id text NOT NULL, to_restaurant_id text NOT NULL, status text NOT NULL, lines text NOT NULL, created_at integer NOT NULL);
-- Trade accounts: there's no customers table today (the Customers page is built from orders
-- and loyalty_members), so trade customers get their own table; orders link to it.
CREATE TABLE trade_accounts (
  id text PRIMARY KEY, restaurant_id text NOT NULL, company_name text NOT NULL, contact_name text,
  email text, phone text, address text, vat_number text, credit_limit real, balance real NOT NULL DEFAULT 0,
  price_tier text, created_at integer NOT NULL
);
ALTER TABLE orders ADD COLUMN trade_account_id text;
```

`restaurants.business_type` needs **no SQL**: Drizzle's `enum` on a text column is TypeScript-only,
so adding `"grocery" | "warehouse"` is a code change.

**Product ↔ stock link.** For a shop, every product gets its own `inventory_items` row
automatically (usage 1 per sale), created and kept in step when the product is saved. That keeps
one stock engine for both worlds: restaurants keep ingredient-style links, shops get
product-level stock, and the Inventory page, low-stock alerts and Reports → Stock all keep working.
(Recipes with several ingredients per dish would be a separate `dish_ingredients` table — useful
for restaurants too, not needed for shops.)

## 5. What changes where

| Area | Files | Change |
|---|---|---|
| Onboarding | `app/super-admin/create-restaurant-form.tsx`, `lib/actions/restaurants.ts` (`createRestaurantAction`, `updateBusinessTypeAction`), `app/settings/restaurant-client.tsx`, `lib/types.ts` | Four types with a one-line description each; seed default categories, receipt footer and feature switches for the type; Settings lets the owner switch features on/off. |
| Profile helper | new `lib/business-profile.ts` | Labels, features and channels per type (§3). Everything below reads from it. |
| Navigation & permissions | `components/sidebar.tsx`, `lib/permissions.ts` | Hide Kitchen Display, Manage Table for shops; rename Manage Dishes → Products; add Suppliers, Purchase Orders, Stocktake (and Locations / Picking for warehouses) with permission keys. |
| Products | `app/manage-dishes/*`, `lib/actions/menu.ts` | Barcode, SKU, cost and margin, sell by (each/kg), VAT override, minimum age, supplier, "track stock" + opening stock, low-stock level. **CSV import/export** (shops have thousands of lines). Print shelf-edge and barcode labels. |
| Till | `app/order-line/order-line-client.tsx` (and the Simple Till `mobile-till-client.tsx`) | **Barcode scan**: listen for scanner input (fast keystrokes ending in Enter), look up by barcode, add; "not found → add as new product" for managers. **Weighed items**: tap → enter weight (later read from a scale) → line shows "0.734 kg × £2.40/kg". Decimal quantities. Hide tables/guests; retail channels. **Age check** pop-up for `min_age` items (and log who confirmed). **Refund / return** (whole order or lines, back to cash or card, stock back in). Price override with reason ("reduced to clear"). Show stock left on tiles; warn or block at 0. |
| Orders & stock | `lib/actions/orders.ts` (`placeOrderAction`, void, edit), `lib/order-helpers.ts`, `lib/actions/sales-records.ts` | Every stock change goes through one function that writes `stock_movements` and updates the quantity. Take stock on sale; **put it back** on void, refund and Sales Records delete; on a Till edit use the per-line diff we already have (`diffEditedItems`) to take or return the difference. Shops skip the kitchen for every paid order (extend the cafe rule). |
| Stock control | `app/inventory/*`, `lib/actions/inventory.ts` | Becomes Stock: movement history per item, **Goods in** (receive against a purchase order or ad hoc, with cost), waste/damage with reason, **Stocktake** (count screen, scan to count, variance report, post adjustments), reorder suggestions (below reorder level → draft purchase order), stock value. |
| Suppliers & purchasing | new `app/suppliers`, `app/purchase-orders`, `lib/actions/purchasing.ts` | Supplier list; create PO (from reorder suggestions), email it (`lib/email.ts`), receive it in part or full. |
| Warehouse | new `app/locations`, picking screen (reuse `app/kitchen` layout), delivery notes | Bins/zones with stock per location, put-away on goods in, batches with expiry and **first-expiry-first-out** picking, pick lists per order, dispatch note / delivery note print, transfers between sites. |
| Customers | `app/customers/page.tsx` (built from orders + `loyalty_members` — no customers table), `app/invoice/[orderId]` | Trade accounts (new `trade_accounts` table): company, VAT number, credit limit, "pay on account", statements; trade price lists (per-customer or per-tier prices — `channelPrices` is the closest existing idea). |
| Online ordering | `app/order/[slug]/*` | Click & collect / delivery slots instead of tables; stock-aware (hide or block sold-out); no table QR. |
| Reports | `lib/data/report-insights.ts`, `app/reports/*` | Hide Tables/Kitchen Speed for shops. Add: stock value, gross margin (needs cost), best/worst sellers by margin, dead stock, shrinkage (from `stock_movements`: waste + count losses), expiry write-offs, supplier spend, sales by hour for staffing, per-site comparison. |
| Printing | `lib/escpos-ticket.ts`, `lib/print-ticket.ts`, print bridge | Retail receipt wording; refund receipt; barcode on receipt (for returns); label printing (barcode/shelf labels — label printers speak their own languages, e.g. Zebra ZPL, so plan a separate label path); pick lists and delivery notes. Cash drawer kick on cash sale. |
| Super Admin & plans | `app/super-admin/*`, `lib/site/pricing.ts` | Filter stores by type. **Till licences**: count registered tills per store and enforce the plan limit (1 / 3 / unlimited) — nothing tracks this today. Align the Pricing page wording with what's live. |
| Docs | `app/help-center/faq.ts`, `docs/DEVELOPER_GUIDE.md` | New FAQ sections (Products & barcodes, Stock, Suppliers, Stocktake, Refunds, Warehouse), screenshots, guide sections — per CLAUDE.md. |

## 6. Hardware

- **Barcode scanner** — any USB or Bluetooth "HID / keyboard" scanner; no driver. Camera scanning
  on tablets via the browser's `BarcodeDetector` (Chrome/Android) or a small JS library.
- **Scales** — phase 2. Start with typed weights. Later: Web Serial in Chrome on a counter PC, a
  Sunmi terminal with a built-in scale, or price-embedded barcodes printed by a labelling scale
  (EAN-13 starting 2x: the Till reads the price or weight from the code — common in UK shops and
  needs no scale connection at all).
- **Label printer** — shelf-edge and product labels (Zebra/Brother/Dymo); via the print bridge.
- **Cash drawer** — opened by the receipt printer (ESC/POS kick command).
- **Handheld scanner/PDA** for warehouse picking and stocktakes — a phone or Android PDA running the web app works.

## 7. UK rules to keep in mind (check with an adviser)

- **VAT**: most food is zero-rated, but confectionery, crisps, soft drinks, alcohol and hot food
  are standard-rated → per-product VAT override.
- **Age-restricted sales** (alcohol, tobacco/vapes, knives, some medicines): Challenge 25 prompt
  and a refusals log.
- **Selling by weight**: the scale must be trade-approved; unit prices (per kg / litre) shown on shelf labels.
- **Food labelling**: food packed on site for direct sale (PPDS) needs full ingredient/allergen labels.
- **Promotions on less healthy food (HFSS)**: restrictions apply to larger businesses — check
  before building multi-buy promotions.

## 8. Suggested phases

**Phase 1 — Grocery shop MVP**
Business types + profile helper + feature switches; sidebar/labels/receipt wording; product
fields (barcode, SKU, cost, VAT override, track stock) with automatic stock item; CSV import;
barcode scanning on the Till; stock movements table with stock taken on sale and put back on
void/edit/delete; goods in and adjustments with reasons; low-stock alerts; reports for stock
value and margin; FAQ + guide.

**Phase 2 — Running a shop properly**
Weighed items (typed weight, then price-embedded barcodes / scales); age-check prompt;
refunds/returns; price override with reasons; promotions (multi-buy, meal deal); shelf-edge and
barcode labels; suppliers and purchase orders with receiving; stocktake; reorder suggestions.

**Phase 3 — Warehouse & multi-site**
Locations/bins and stock per location; batches and expiry (FEFO); picking screen and delivery
notes; transfers between sites; trade accounts with credit and statements; trade price tiers;
central product catalogue shared across sites; combined multi-site reports; till-licence limits.

**Worth doing now regardless of shops** (they affect restaurants today): put stock back on
void/edit/Sales Records delete, a stock movement log, and not hiding oversells behind the clamp at 0.
