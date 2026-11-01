# 06 — Phase 5: General retail shops

Part of the [retail plan set](README.md). Depends on: Phases 0–4.

"Retail" here means non-food shops: clothing & shoes, gifts, phones & electronics, hardware, books,
pharmacy-style counters. Everything in Phases 0–4 applies (barcodes, units, stock, refunds,
suppliers, stocktake). This phase adds what those shops need on top. Checked against the
platform: none of these exist today.

| Need | Typical shop | Step |
|---|---|---|
| Sizes / colours with their own barcode and stock | Clothing, shoes | 5.1 |
| Serial / IMEI numbers per item sold | Phones, electronics, bikes | 5.2 |
| Multi-buy, % off a category, bundles | Everyone | 5.3 |
| Gift receipts (no prices) | Gifts, clothing | 5.4 |
| Store credit / exchange credit | Clothing, gifts | 5.5 |
| Online shop with variants and stock | Everyone | 5.6 |
| Sold by length / volume | Fabric, rope, cable, paint | 2.1 (already planned) |
| Returns policy on receipts | Everyone | 3.7 + 7.2 |

---

## Step 5.1 — Variants (size, colour…)

**Goal.** One product "Oxford shirt" with sizes S–XL and colours, each combination having its
own SKU, barcode, stock and (optionally) price.

**Schema.**
```sql
ALTER TABLE dishes ADD COLUMN variant_options text;   -- JSON: [{"name":"Size","values":["S","M","L"]},{"name":"Colour","values":["White","Blue"]}]
CREATE TABLE product_variants (
  id text PRIMARY KEY, restaurant_id text NOT NULL, dish_id text NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  options text NOT NULL,          -- JSON {"Size":"M","Colour":"Blue"}
  name text NOT NULL,             -- "M / Blue"
  sku text, price real, cost_price real,
  inventory_item_id text,         -- its own stock item (2.4 logic per variant)
  active integer NOT NULL DEFAULT 1, sort integer
);
-- product_barcodes.variant_id (2.2) points scans at a variant
```

**Do.**
1. Product form: "Has variants" → define options → grid of combinations to fill SKU, barcode, price (blank = product price), stock.
2. Till: tapping the product opens a variant picker (size × colour grid with stock); scanning a variant barcode adds it directly.
3. `OrderItem` gets `variantId` and `name` becomes "Oxford shirt — M / Blue".
4. Stock, stocktake, goods in, labels and reports work per variant (each has its own stock item).
5. CSV import (2.5) gets `parent_sku`, `option1..3` columns.

**Done when.** 3 sizes × 2 colours = 6 variants, each scannable with separate stock; selling M/Blue reduces only that one.

**Docs.** FAQ: "How do I add sizes and colours?"

---

## Step 5.2 — Serial / IMEI numbers

**Schema.**
```sql
ALTER TABLE dishes ADD COLUMN track_serials integer NOT NULL DEFAULT 0;
CREATE TABLE serial_numbers (
  id text PRIMARY KEY, restaurant_id text NOT NULL, dish_id text NOT NULL, variant_id text,
  serial text NOT NULL, status text NOT NULL DEFAULT 'in_stock',   -- in_stock | sold | returned | faulty
  order_id text, received_at integer, sold_at integer
);
CREATE UNIQUE INDEX serial_numbers_idx ON serial_numbers (restaurant_id, serial);
```

**Do.** Goods in asks for each serial (scan); the Till asks which serial is being sold (scan or pick);
receipt and invoice print it; refunds put that serial back (or mark faulty); search a serial → its history.

---

## Step 5.3 — Promotions

**Schema.**
```sql
CREATE TABLE promotions (
  id text PRIMARY KEY, restaurant_id text NOT NULL, name text NOT NULL,
  kind text NOT NULL,          -- multibuy_price ("3 for £2") | multibuy_free ("buy 2 get 1 free") | percent_off | amount_off | bundle ("meal deal")
  rules text NOT NULL,         -- JSON: products/categories/variants, quantities, price/percent, bundle slots
  starts_at integer, ends_at integer, active integer NOT NULL DEFAULT 1, channels text,
  created_at integer NOT NULL
);
```

**Do.**
1. `/promotions` (permission `promotions`): create with a live example ("Buy 3 Coke 330ml → £2.00, saves £0.67").
2. A pure function `applyPromotions(items, promotions)` → discount lines (`OrderItem.promotionId` on a negative line or a per-line discount) — used by the Till, online shop and `placeOrderAction` (server recomputes; never trusts the client, like coupons today).
3. Receipt shows each promotion saving; Reports → Promotions (uses, cost).
4. Stacking rules: one promotion per line; best for the customer; coupons apply after promotions.
5. HFSS check (00 §4) — a warning when a multibuy includes products in categories flagged "less healthy".

**Done when.** 3 for £2 applies on the third item and un-applies when one is removed; a meal deal fills its slots from the right categories; the server total matches the Till.

**Docs.** FAQ: "How do I set up a multi-buy or meal deal?"

---

## Step 5.4 — Gift receipts

**Do.** After a sale (or from History): "Gift receipt" prints the items without prices, with the
receipt barcode for returns (3.7) and the returns policy.

---

## Step 5.5 — Store credit

**Schema.**
```sql
CREATE TABLE store_credits (
  id text PRIMARY KEY, restaurant_id text NOT NULL, code text NOT NULL,   -- printed as a barcode
  balance real NOT NULL, original real NOT NULL, customer_name text, loyalty_member_id text,
  expires_at integer, created_at integer NOT NULL
);
```

**Do.** Refund method "Store credit" issues a credit slip with a barcode; the Till accepts it as a
payment method (scan the slip → balance used, remainder kept). Lays the ground for the
"Gift Cards" product already listed as coming soon on the website.

---

## Step 5.6 — Retail online shop

**Do.** The online ordering pages (`app/order/[slug]`) for shops: product search, categories,
variants picker, "x left" or "Out of stock" (hide or show), click & collect or delivery (no tables),
weight products sold in fixed steps or hidden (3.4). Stock is reserved when the order is accepted
on the Till (existing Accept flow) and taken when it's completed.
