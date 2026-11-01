# 05 — Phase 4: Stock control and purchasing

Part of the [retail plan set](README.md). Depends on: 0.2–0.4, 2.4. Screens live under
`/inventory` (labelled **Stock** for shops); new permission keys `stock`, `suppliers`,
`purchase-orders`, `stocktake` in `lib/permissions.ts` with sidebar items gated by feature (1.3).

---

## Step 4.1 — Stock page and history

**Goal.** One screen with every stock item: quantity, unit, value, low-stock state, and the full
history of why it changed.

**Files.** `app/inventory/page.tsx`, `inventory-client.tsx`, `lib/data/stock.ts` (new: list with
value = qty × cost, last movement).

**Do.**
1. Columns: product/item, SKU, quantity + unit, low-stock level, cost, stock value, last change; filters: low, out, negative, category, supplier; search incl. barcode (scan into search works, 3.1 hook).
2. Row → drawer with movement history (date, reason, change, after, by, link to the order / PO / count).
3. Totals bar: stock value at cost, items low, items out.

**Done when.** Selling, voiding, adjusting and receiving all appear in the history with links.

**Docs.** FAQ: "How do I see why stock changed?"

---

## Step 4.2 — Goods in (receiving stock)

**Goal.** Book deliveries in quickly — by scanning — with the cost price.

**Do.**
1. Stock → **Goods in**: optional supplier and delivery note number; scan or search products;
   enter quantity (or cases × pack size, using the case barcode's `pack_qty`) and cost.
2. Save → `received` movements; updates `cost_price` (latest cost; weighted average as an option);
   if from a purchase order, ticks off its lines (4.5).
3. Batches/expiry if `batches` is on (6.2).

**Done when.** Scanning a case barcode (pack 12) twice books 24 in; cost updates; history shows "Received — delivery 4471".

---

## Step 4.3 — Adjustments and waste

**Goal.** Record damage, out-of-date, theft, own use and corrections with a reason.

**Do.** Stock → **Adjust**: product, + / −, reason (Damaged, Out of date, Theft / loss, Own use,
Correction, Other), note → `adjust` or `waste` movements. Reports → Stock losses (8) sum these at cost.

---

## Step 4.4 — Suppliers

**Schema.**
```sql
CREATE TABLE suppliers (
  id text PRIMARY KEY, restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL, contact_name text, email text, phone text, address text,
  account_ref text, lead_time_days integer, min_order real, notes text,
  created_at integer NOT NULL
);
```

**Do.** `/suppliers`: list, add, edit; each supplier shows its products (via `dishes.supplier_id`)
and open purchase orders. Product form gets a Supplier picker and a "supplier code" field
(`ALTER TABLE dishes ADD COLUMN supplier_code text;`).

---

## Step 4.5 — Purchase orders

**Schema.**
```sql
CREATE TABLE purchase_orders (
  id text PRIMARY KEY, restaurant_id text NOT NULL, supplier_id text NOT NULL,
  number text NOT NULL,                       -- PO0001
  status text NOT NULL DEFAULT 'draft',       -- draft | sent | part_received | received | cancelled
  expected_at integer, notes text, total real,
  created_by_name text, created_at integer NOT NULL, sent_at integer, received_at integer
);
CREATE TABLE purchase_order_lines (
  id text PRIMARY KEY, purchase_order_id text NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id text NOT NULL, qty_ordered real NOT NULL, qty_received real NOT NULL DEFAULT 0,
  unit_cost real
);
```

**Do.**
1. `/purchase-orders`: create for a supplier (add lines by scan/search, or from reorder suggestions 4.7).
2. **Send**: email the PO as a PDF/HTML to the supplier (`lib/email.ts`), status `sent`.
3. **Receive**: opens Goods in (4.2) pre-filled; part deliveries leave the PO `part_received`.
4. Supplier spend in Reports (8).

**Done when.** Create PO → send (email arrives) → receive 8 of 10 → status part received → receive 2 → received; stock and history correct.

**Docs.** FAQ: "How do I order from a supplier?"

---

## Step 4.6 — Stocktake

**Schema.**
```sql
CREATE TABLE stock_counts (
  id text PRIMARY KEY, restaurant_id text NOT NULL, name text, scope text,   -- all | category:<id> | location:<id>
  status text NOT NULL DEFAULT 'open',                                        -- open | review | posted | cancelled
  started_by_name text, created_at integer NOT NULL, posted_at integer
);
CREATE TABLE stock_count_lines (
  id text PRIMARY KEY, stock_count_id text NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  inventory_item_id text NOT NULL, expected real NOT NULL, counted real, counted_by_name text, counted_at integer
);
```

**Do.**
1. Start a count (all, a category, or a location) — expected quantities are snapshotted.
2. Count screen for phones: scan → type quantity (or scan each item to +1); several people can count at once.
3. Sales during the count: lines record sales after the snapshot so variance = counted − (expected − sold since).
4. Review: variances by value; post → `count` movements set stock to counted.

**Done when.** Count 3 products with one off by −2 → review shows −2 at cost → post → stock equals counted, history says "Stocktake 2026-…".

**Docs.** FAQ: "How do I do a stocktake?"

---

## Step 4.7 — Reorder suggestions

**Do.** Stock → **Reorder**: items at or below `reorder_level` (default = low-stock level), suggested
qty = `reorder_qty` or (level × 2 − stock), grouped by supplier → "Create purchase orders" (4.5).
Optionally use average daily sales over the last 28 days × supplier lead time.

---

## Step 4.8 — Alerts

**Do.** Daily (on Dashboard load, like the auto-void sweep — there is no job runner): low-stock and
negative-stock counts on the Dashboard and Reports alerts; expiry within N days (6.2);
optional email to the owner (`lib/email.ts`).
