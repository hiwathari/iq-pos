# 01 — Phase 0: Foundations (money and stock)

Part of the [retail plan set](README.md). Do this phase first: every later step relies on totals
being rounded the same way everywhere and on stock moving through one function. Restaurants
benefit immediately (stock is currently not returned on voids, edits or deletes).

---

## Step 0.1 — Line totals rounded to the penny

**Goal.** One rule for "how much is this line", so weighed items (0.734 kg × £2.40) never leave
fractions of a penny and every screen, receipt and report agrees.

**Schema.** None.

**Files.**
- `src/lib/types.ts` — add `roundMoney(n)` and `lineTotal(item)`; use it in `orderBreakdown`.
- Replace `price * qty` with `lineTotal(...)` in: `app/order-line/order-line-client.tsx`,
  `app/order-line/mobile-till-client.tsx`, `app/order/[slug]/online-order-client.tsx`,
  `app/order/[slug]/kiosk/kiosk-client.tsx`, `app/invoice/[orderId]/invoice-client.tsx`,
  `app/reports/reports-client.tsx`, `lib/actions/orders.ts`, `lib/data/reports.ts`,
  `lib/data/report-insights.ts`, `lib/escpos-ticket.ts`, `lib/print-ticket.ts`
  (`grep -rn "\.price \* .*\.qty" src` lists all 24).

**Do.**
1. `export const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;`
2. `export const lineTotal = (i: Pick<OrderItem, "price" | "qty">) => roundMoney(i.price * i.qty);`
3. `orderBreakdown`: subtotal = Σ `lineTotal`; tax per line = `roundMoney(lineTotal × rate)`
   before the discount factor; round `tax` and `total`.
4. Replace every other `price * qty`.
5. Add a unit check script (09 §2) for the rounding cases.

**Done when.** Existing orders show identical totals before/after (whole-unit prices already
round exactly); 0.734 × 2.40 = 1.76; 0.735 × 2.40 = 1.76; 0.738 × 2.40 = 1.77; End Day
figures for a test day are unchanged.

**Docs.** Guide §7.1 (money rule). No FAQ change (nothing visible).

---

## Step 0.2 — Stock movement log and one stock function

**Goal.** Every change to stock is recorded with a reason, who and when — the audit trail,
the source for stock reports, and the base for goods in, stocktakes and transfers.

**Schema.**
```sql
CREATE TABLE stock_movements (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  inventory_item_id text NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  change real NOT NULL,              -- + in, − out, in the item's unit (pcs, kg, l…)
  quantity_after real NOT NULL,
  reason text NOT NULL,              -- sale | void | edit | refund | received | adjust | count | waste | transfer_in | transfer_out | opening
  reference_id text,                 -- order / purchase order / stock count / transfer id
  note text,
  unit_cost real,
  created_by_name text,
  created_at integer NOT NULL
);
CREATE INDEX stock_movements_item_idx ON stock_movements (restaurant_id, inventory_item_id, created_at);
CREATE INDEX stock_movements_ref_idx ON stock_movements (restaurant_id, reference_id);
```

**Files.**
- `src/db/schema.ts` — `stockMovements` table.
- New `src/lib/stock.ts` — `applyStockChanges(restaurantId, changes[], { reason, referenceId, byName, note })`:
  updates `inventory_items.quantity` and inserts one movement per item, in one `db.batch`.
- `src/lib/order-helpers.ts` — `decrementInventoryForOrder` becomes a thin wrapper:
  works out usage per item (as now) and calls `applyStockChanges(..., { reason: "sale", referenceId: orderId })`.
- `src/lib/actions/inventory.ts` — `adjustInventoryStockAction` and create (opening stock) go
  through `applyStockChanges` with reasons `adjust` / `opening`.

**Do.**
1. Add the table and Drizzle schema.
2. Write `applyStockChanges`; keep the existing "clamp at 0" behaviour behind a flag for now (0.4 replaces it).
3. Route the three existing writers through it.
4. Pass the order id into `decrementInventoryForOrder` (it's called from `placeOrderAction` right after insert).

**Done when.** Placing an order with a stock-linked dish writes a `sale` movement with the order
id; an Inventory ± adjust writes an `adjust` movement; `quantity_after` equals the item's quantity.

**Docs.** Guide §6 (table), §7 (new "Stock" section). FAQ added in 4.1 when the history is visible.

---

## Step 0.3 — Stock goes back when an order is undone

**Goal.** Voids, Till edits, Sales Records edits/deletes and refunds put stock right.

**Schema.** None (uses 0.2).

**Files.** `src/lib/actions/orders.ts` (void action ~line 361, reject online order ~397, merge
tables ~503 — merge moves items, no stock change), `src/lib/data/orders.ts`
(`autoVoidStaleOrders`), `src/lib/actions/sales-records.ts` (`updateOrderRecordAction`,
`deleteOrderRecordAction`), `src/lib/stock.ts`.

**Do.**
1. `stockUsageForItems(restaurantId, items)` in `lib/stock.ts` → `Map<inventoryItemId, amount>`
   (the calculation now inside `decrementInventoryForOrder`).
2. **Void / reject / auto-void**: return the usage of the order's items, reason `void`, reference the order.
   Guard: only if the order has a `sale` movement and no `void` movement yet (idempotent).
3. **Till edit** (`placeOrderAction` edit path): usage(new items) − usage(old items) per item →
   apply the difference, reason `edit`. (Same idea as `diffEditedItems`, but by stock item.)
4. **Sales Records edit**: same difference as 3; **delete**: like a void, reason `void`, note "deleted in Sales Records".
5. Refunds come in step 3.7 (reason `refund`, only for refunded lines and only if "back to stock" is ticked).

**Done when.** Sell 2 → stock −2; void → back to start; edit 2→3 → −1 more; Sales Records delete → back;
voiding twice changes nothing the second time. Remove the §13.3 "doesn't put stock back" note.

**Docs.** Guide §7.1, §13.3; FAQ "Inventory" answer: voids and edits now put stock back.

---

## Step 0.4 — Overselling: allow, warn or block

**Goal.** The owner chooses what happens when stock would go below zero.

**Schema.**
```sql
ALTER TABLE restaurants ADD COLUMN negative_stock text NOT NULL DEFAULT 'allow';  -- allow | warn | block
```

**Files.** `src/db/schema.ts`, `src/lib/stock.ts`, `src/lib/actions/orders.ts`,
`app/settings/restaurant-client.tsx` (setting), Till (warning UI, step 3.8).

**Do.**
1. Stop clamping at 0: quantities can go negative (that *is* the information — "we sold 3 we didn't have").
2. `placeOrderAction`: if `block` and any stock item would go below 0 → return an error naming the
   product; if `warn` → place it and return a warning list for the Till to show.
3. Default per business type (step 1.1): restaurant/cafe/grocery/retail `allow`, warehouse `block`.
4. Inventory page and Reports → Stock show negative quantities in red.

**Done when.** With `block`, selling more than in stock is refused with the product named; with
`warn`, it goes through and the Till shows "Stock now −1 for Milk 1L"; with `allow`, silent.

**Docs.** FAQ: "What happens when something runs out of stock?"; guide §7 Stock.
