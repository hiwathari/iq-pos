# 04 — Phase 3: The Till for shops — scanning, weighing, refunds

Part of the [retail plan set](README.md). Depends on: 0.1–0.3, 1.5, 2.1–2.4.
Main file: `src/app/order-line/order-line-client.tsx` (Full Till); the Simple Till
(`mobile-till-client.tsx`) gets scanning and quantities but not refunds in this phase.

---

## Step 3.1 — Scanner input on the Till

**Goal.** Scan a product and it's in the basket. Scan it again → quantity +1.

**How scanners behave.** A USB/Bluetooth scanner in HID mode "types" the digits very fast and
presses Enter. No driver, works in any browser.

**Files.** New `src/lib/use-barcode-scanner.ts` (hook), `order-line-client.tsx`,
`app/order-line/page.tsx` (load barcodes with the products), `lib/barcode.ts` (2.2).

**Do.**
1. Hook `useBarcodeScanner(onScan)`: listens on `window` `keydown`; buffers characters that arrive
   < 40 ms apart; on Enter with ≥ 6 characters → `onScan(code)`. Ignores typing in inputs
   **except** the Till search box (scanning into search = lookup too). Resets after 100 ms idle.
2. Till builds `Map<code, { dish, packQty }>` from the loaded barcodes (and a SKU map).
3. `onScan`: `normaliseCode` → exact barcode → UPC-A/EAN-13 variant → embedded barcode (3.2) → SKU.
   - Unit product: add `packQty` (1, or 12 for a case code).
   - Weight product without an embedded weight: open the weight pad (3.3).
   - Age-restricted: queue the age check (3.5).
4. Not found: beep + toast "Barcode 50123… not found". Managers get **Add product** (opens the
   product form with the barcode filled in, returns to the Till after saving); staff get **Sell as custom item**.
5. Sounds: short "ok" and "error" beeps (reuse `lib/order-sounds.ts` volume settings).
6. Last-scanned line flashes so the cashier sees what was added.

**Done when.** With a scanner (or Playwright typing "5000112637922\n" fast): the product is
added; scanning 3 times gives qty 3; an unknown code shows the not-found toast; typing in the
customer-name field never triggers a scan.

**Docs.** FAQ (orders): "How do I scan products?"; screenshot of the toast/flash.

---

## Step 3.2 — Price- and weight-embedded barcodes

**Goal.** Labels printed by a labelling scale (deli, butcher, loose veg weighed in the back) scan
straight in with the right weight or price.

**Format.** GS1 "variable measure" codes start with `2`. A common layout (configurable, because
scales differ):

```
2 | 1 | IIIII | VVVVV | C      e.g. 2 1 01234 01750 0
  prefix  item  value  check   → item 01234, value 01750 = £17.50 (price) or 1.750 kg (weight)
```

**Schema.**
```sql
ALTER TABLE restaurants ADD COLUMN embedded_barcodes text;  -- JSON list of formats
-- e.g. [{"prefix":"21","itemDigits":5,"value":"price","valueDigits":5,"decimals":2},
--       {"prefix":"22","itemDigits":5,"value":"weight","valueDigits":5,"decimals":3}]
ALTER TABLE dishes ADD COLUMN plu text;     -- the item code a scale uses (01234)
```

**Do.**
1. Settings → Barcodes: list of formats (prefix, item digits, value = price or weight, decimals), with a "test a barcode" box that shows how it would be read.
2. `parseEmbedded(code, formats)` → `{ plu, price? , weight? }`; verify the EAN-13 check digit.
3. Product form: PLU field (for weight products and anything a scale labels).
4. On scan: find the product by PLU; weight → qty = weight; price → qty = price ÷ unit price
   (rounded to 3 decimals) and the line total is fixed to the printed price.
5. Each scan is its own line (two packs of ham with different weights stay separate).

**Done when.** With format `22 / weight / 3 decimals`, scanning `2201234017507` adds the PLU-01234
product at 1.750 kg; with `21 / price`, `2101234017500` adds a line of exactly £17.50.

**Docs.** FAQ: "Using labels from a weighing scale"; guide section on embedded barcodes.

---

## Step 3.3 — Weighed sales (typed weight)

**Goal.** Tap or scan a weight product → enter the weight → line "0.734 kg × £2.40/kg = £1.76".

**Files.** New `app/order-line/weight-pad.tsx`; `order-line-client.tsx` (open it from tile tap,
scan, and tapping an existing weighed line to change it); `lib/units.ts` (2.1).

**Do.**
1. Weight pad modal: product name and price per kg, a number pad, **g / kg** toggle (default g
   for speed: "734"), tare button (subtract `dish.tare`), live total, Add / Cancel.
2. Validation: ≥ `min_qty`, rounded to `qty_step`, max 99.999.
3. Cart line for weight items: "Bananas loose — 0.734 kg @ £0.90/kg", total right-aligned; no −/+
   buttons (tap to edit weight instead). Each weighing is its own line (no merging).
4. The cart item stores `qty` in the product unit plus `sellBy`, `unit`, `unitPrice` snapshots.
5. A scale (3.10) later just fills in the weight field.

**Done when.** Bananas £0.90/kg, type 1250 g → 1.250 kg, £1.13; edit to 800 g → £0.72; receipt
and History show the weight line; stock drops by 1.25 then is corrected by the edit (0.3).

**Docs.** FAQ (orders): "How do I sell loose items by weight?" with a marked weight-pad screenshot.

---

## Step 3.4 — Quantities and units everywhere

**Goal.** Every place that shows or counts order lines understands decimals and units.

**Files and changes.**
- **Till / Simple Till cart**: unit products get a quantity pad (tap the qty → type 24) besides −/+.
- **Receipts** — `lib/escpos-ticket.ts`, `lib/print-ticket.ts`, `app/invoice/[orderId]`: weight lines
  print as two lines: `Bananas loose` / `  0.734 kg @ £0.90/kg        £0.66`.
- **History / Tickets cards, Sales Records editor** (`app/sales-records/*`): `formatQty(qty, unit)`;
  the editor allows decimals for weight lines only.
- **Kitchen Display** (if on): `formatQty` instead of `2×`.
- **Reports** (`lib/data/report-insights.ts`, `reports.ts`): "Items sold" counts unit products only;
  a separate "Weight sold" by unit (kg, l, m); Items tab shows "12.4 kg" for weight products.
- **Online ordering / kiosk**: weight products either hidden or sold in fixed steps (e.g. 250 g) — decision per store (`sell online` checkbox on the product).
- **CSV export of orders** (`downloadOrdersCsv`): items column uses `formatQty`.

**Done when.** A mixed sale (2 milk, 0.734 kg bananas) prints, displays and reports correctly in
all of the above; Reports "Items sold" = 2 and "Weight sold" = 0.734 kg.

---

## Step 3.5 — Age check

**Goal.** Selling an age-restricted product asks the cashier to confirm, and refusals are logged.

**Schema.**
```sql
CREATE TABLE age_checks (
  id text PRIMARY KEY, restaurant_id text NOT NULL, order_id text, dish_id text NOT NULL,
  min_age integer NOT NULL, result text NOT NULL,      -- approved | refused
  method text,                                         -- looked over 25 | ID checked
  staff_name text, created_at integer NOT NULL
);
```

**Do.**
1. Adding a product with `min_age` (tap or scan) opens: "Age restricted — 18+. Challenge 25: does the
   customer look over 25? / ID checked / Refuse sale".
2. Approved once per sale (not for every can); refused removes the item and logs it.
3. Reports → Age checks (refusals log, by staff), required by many licensing authorities.

**Done when.** Scanning beer opens the check; approving adds it; scanning a second beer doesn't
ask again; refusing removes it and appears in the log.

**Docs.** FAQ: "Selling alcohol and other age-restricted products".

---

## Step 3.6 — Price override and "reduced to clear"

**Goal.** Managers can change a line's price with a reason (damaged, reduced to clear, price match).

**Do.**
1. Tap a line → "Change price" (permission `till-discount`, or a new `till-price-override`).
2. Reasons: Reduced to clear, Damaged, Price match, Other (typed). Stored on the line
   (`OrderItem.priceOverride = { original, reason, by }`).
3. Reports → Discounts tab includes overrides (original − new) by reason and staff.

**Done when.** Overriding £2.00 to £1.00 "Reduced to clear" totals correctly and shows in Reports.

---

## Step 3.7 — Refunds, returns and exchanges

**Goal.** Refund a whole sale or some lines, to the original payment method (or cash / store
credit), optionally putting the items back in stock; exchanges are a refund plus a new sale.

**Schema.**
```sql
CREATE TABLE refunds (
  id text PRIMARY KEY, restaurant_id text NOT NULL, order_id text NOT NULL,
  number text NOT NULL,                      -- R0001
  items text NOT NULL,                       -- JSON: [{lineId, qty, amount, backToStock}]
  amount real NOT NULL, tax real NOT NULL,
  method text NOT NULL,                      -- Cash | terminal name | Store credit
  reason text, created_by_name text, created_at integer NOT NULL
);
ALTER TABLE orders ADD COLUMN refunded_amount real NOT NULL DEFAULT 0;
```

**Do.**
1. History → open a sale → **Refund** (permission `till-refund`). Find a sale by scanning the
   receipt barcode (receipts get the order number as a Code 128 barcode — 7.2) or searching.
2. Pick lines and quantities (weight lines: whole line or a weight), "Back to stock" tick per line
   (default on; off for damaged), reason, refund method.
3. Card refunds: SumUp/Teya refund APIs where available (`lib/sumup.ts`, `lib/teya.ts`); otherwise
   "Refund on the card machine, then confirm here".
4. Writes the refund, `refund` stock movements (0.2) for ticked lines, and prints a refund receipt.
5. End Day (`shifts`) and Reports subtract refunds by method on the day they happen (not the
   original sale's day). `salesByTender` gets refunds as negative lines.
6. Exchange: "Refund & new sale" carries the refund amount as a credit into a new basket.

**Done when.** Sell 3 items by card, refund 1 to card with back-to-stock → refund receipt, stock +1,
End Day card total reduced by that amount, Reports show the refund; can't refund more than was sold.

**Docs.** FAQ: "How do I refund or exchange something?"; guide §7.1 (order lifecycle) and End Day.

---

## Step 3.8 — Stock left on tiles

**Goal.** The cashier sees stock at a glance and is warned before overselling (0.4 setting).

**Do.** Tiles show "12 left" (unit) or "3.4 kg left" (weight) when tracking; amber at/below the
low-stock level, red at 0 or below; `warn` mode shows a toast after the sale; `block` mode greys the tile.

---

## Step 3.9 — Camera scanning

**Goal.** Scan with the tablet camera when there's no scanner.

**Do.** A camera button next to search opens a small preview; use `BarcodeDetector`
(Chrome/Android/Sunmi) or a JS/WASM decoder fallback (iPad Safari); each detected code goes through
the same `onScan`. Also used on the Stocktake and Goods-in screens (4.2, 4.6) on phones.

---

## Step 3.10 — Scales

**Goal.** The weight pad reads the weight from a connected scale.

**Do.** Settings → Scale: none / Web Serial (Chrome on a PC; pick the port, choose the protocol of
the scale model) / Sunmi built-in scale (Sunmi app bridge, like the Till Android app). The weight
pad shows the live weight with "Stable" and "Use weight". Only trade-approved scales may be used
for pricing (00 §4). Protocols vary by brand, so support is added per model on request.
