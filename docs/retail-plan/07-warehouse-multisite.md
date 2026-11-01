# 07 — Phase 6: Warehouses and multi-site

Part of the [retail plan set](README.md). Depends on: Phases 0–4 (and 5.1 if variants are stored).
Warehouse features are switched on by the `warehouse` business type (or individually in Settings).

---

## Step 6.1 — Locations and bins

**Schema.**
```sql
CREATE TABLE stock_locations (
  id text PRIMARY KEY, restaurant_id text NOT NULL, code text NOT NULL,    -- "A-03-2"
  name text, kind text NOT NULL DEFAULT 'bin',                            -- zone | aisle | bin | shop_floor | backroom
  parent_id text, pickable integer NOT NULL DEFAULT 1, sort integer
);
CREATE UNIQUE INDEX stock_locations_code_idx ON stock_locations (restaurant_id, code);
CREATE TABLE stock_levels (
  inventory_item_id text NOT NULL, location_id text NOT NULL, quantity real NOT NULL DEFAULT 0,
  PRIMARY KEY (inventory_item_id, location_id)
);
ALTER TABLE stock_movements ADD COLUMN location_id text;   -- if not added in 0.2
```

**Do.** `/locations`: create zones/aisles/bins, print bin labels (barcode = code). Every stock
change with `locations` on names a location; `inventory_items.quantity` stays the total (sum of
levels). Put-away after goods in: scan item → scan bin. Move stock between bins (two movements).
Shops can use two locations (Shop floor / Backroom) for "replenish the shelf" lists.

---

## Step 6.2 — Batches and expiry

**Schema.**
```sql
CREATE TABLE stock_batches (
  id text PRIMARY KEY, restaurant_id text NOT NULL, inventory_item_id text NOT NULL,
  location_id text, lot text, expires_on text, quantity real NOT NULL, received_at integer NOT NULL
);
```

**Do.** Goods in asks for lot and expiry (or reads them from GS1-128 / GS1 DataMatrix barcodes:
AI (10) lot, (17) expiry). Sales and picking take from the earliest expiry first (FEFO). Expiry
report: expiring in 7/14/30 days, expired; one-tap "write off" (waste movement).

---

## Step 6.3 — Picking (reusing the Kitchen Display)

**Goal.** Orders to be dispatched appear on a Picking screen, grouped by location in walking order.

**Do.** The Kitchen Display (`app/kitchen/kitchen-client.tsx`) in "picking" mode for warehouses:
tickets list lines with bin codes and quantities, sorted by `stock_locations.sort`; picker scans
the bin and the item (wrong item → error beep); short-pick records the shortage; "Picked" moves the
order to Packed. Instant ticks (useOptimistic) already exist. A phone layout for pickers walking aisles.

---

## Step 6.4 — Delivery notes and dispatch

**Do.** Packed orders print a delivery note (items, quantities, batches/serials, customer
address, signature box) and optional box labels; "Dispatched" with carrier and tracking number;
trade invoices (6.6) from the same order.

---

## Step 6.5 — Transfers between sites

**Schema.**
```sql
CREATE TABLE stock_transfers (
  id text PRIMARY KEY, number text NOT NULL,
  from_restaurant_id text NOT NULL, to_restaurant_id text NOT NULL,
  status text NOT NULL DEFAULT 'draft',      -- draft | sent | received | cancelled
  lines text NOT NULL,                       -- JSON [{dishId/variantId, qty, sent, received}]
  created_by_name text, created_at integer NOT NULL, sent_at integer, received_at integer
);
```

**Do.** Sites under the same owner (or regional admin, `restaurant_access`) only. Send → `transfer_out`
movements at the source; Receive (scan to check) → `transfer_in` at the destination; differences
reported. Products are matched between sites by SKU/barcode (or by the central catalogue, 6.7).

---

## Step 6.6 — Trade accounts

**Schema.** (No customers table exists today — the Customers page is built from orders and loyalty members.)
```sql
CREATE TABLE trade_accounts (
  id text PRIMARY KEY, restaurant_id text NOT NULL, company_name text NOT NULL, contact_name text,
  email text, phone text, billing_address text, delivery_address text, vat_number text,
  credit_limit real, payment_terms_days integer, balance real NOT NULL DEFAULT 0,
  price_tier text, on_hold integer NOT NULL DEFAULT 0, created_at integer NOT NULL
);
ALTER TABLE orders ADD COLUMN trade_account_id text;
CREATE TABLE trade_payments (
  id text PRIMARY KEY, restaurant_id text NOT NULL, trade_account_id text NOT NULL,
  amount real NOT NULL, method text NOT NULL, reference text, created_at integer NOT NULL
);
```

**Do.** Till: attach a trade account → trade prices (6.6a) and payment method "On account" (blocked
over the credit limit or on hold); invoice with VAT number and payment terms (`app/invoice/[orderId]`
extended); statements (opening balance, invoices, payments, closing); aged debt report.
**6.6a Price tiers**: `ALTER TABLE dishes ADD COLUMN tier_prices text;` JSON `{"trade":1.10,"wholesale":0.95}` — same idea as `channelPrices`, also by case (`pack_qty`).

---

## Step 6.7 — Central product catalogue

**Goal.** A group with several shops manages products once.

**Do.** A "group" (the owner's sites, or a regional admin's) holds master products; each site gets a
linked copy (`dishes.master_id`) with site-level price/stock overrides. Changing the master name,
barcode, VAT or cost pushes to sites; prices can be pushed or left local. Matches the Pricing page
promise "Multi-site reporting & central menus".

```sql
ALTER TABLE dishes ADD COLUMN master_id text;
ALTER TABLE dishes ADD COLUMN local_price integer NOT NULL DEFAULT 0;   -- 1 = this site keeps its own price
```

---

## Step 6.8 — Multi-site reports and till licences

**Do.**
1. Reports with a site picker (all my sites / one site): sales, stock value, transfers, best sellers by site.
2. **Till licences** (Pricing page: Basic 1 till, Standard up to 3, Premium unlimited): register each
   till device on first sign-in (`till_devices` table: id, restaurant_id, name, last_seen_at); Super
   Admin sets the plan per business (`restaurants.plan`); a fourth till on Standard sees "Till limit
   reached — ask your admin". Nothing tracks tills today.

```sql
ALTER TABLE restaurants ADD COLUMN plan text;            -- basic | standard | premium
CREATE TABLE till_devices (
  id text PRIMARY KEY, restaurant_id text NOT NULL, name text NOT NULL,
  created_at integer NOT NULL, last_seen_at integer, revoked integer NOT NULL DEFAULT 0
);
```
