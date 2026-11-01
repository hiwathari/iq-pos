# 03 — Phase 2: Products — units or weight, barcodes, cost, import, labels

Part of the [retail plan set](README.md). Depends on: 0.1 (rounding), 0.2 (stock log), 1.1 (profile).

The product table stays `dishes` (renaming a core table is risky and buys nothing); the UI calls
them Products for shops (1.3).

---

## Step 2.1 — Sold by unit, weight, volume or length

**Goal.** Each product is chosen as **sold by unit** (each, pack, box…) or **sold by weight**
(kg / g), with volume (l / ml) and length (m / cm) for shops that need them (draught, fabric,
rope, cable). The price is per that unit: "£2.40 / kg", "£0.89 each".

**Schema.**
```sql
ALTER TABLE dishes ADD COLUMN sell_by text NOT NULL DEFAULT 'unit';   -- unit | weight | volume | length
ALTER TABLE dishes ADD COLUMN unit text NOT NULL DEFAULT 'each';      -- each|pack|box|case | kg|g|lb|oz | l|ml | m|cm
ALTER TABLE dishes ADD COLUMN min_qty real;                           -- e.g. 0.05 kg smallest sale
ALTER TABLE dishes ADD COLUMN qty_step real;                          -- e.g. 0.005 kg rounding step; 1 for units
ALTER TABLE dishes ADD COLUMN tare real;                              -- container weight to subtract, in the product unit
```

**Rules.**
- `unit` products: quantity is a whole number (step 1), price is per item. Default for restaurants/retail.
- `weight` products: price is **per kg** (or per lb if the store uses imperial display);
  quantity is stored in the product's unit with 3 decimals (0.734 kg). The Till lets staff type
  grams or kilograms and converts. Default for Fruit & Veg / Meat & Fish / Deli categories in a grocery.
- `volume` / `length`: same as weight with l / m.
- Line total = `lineTotal(price, qty)` from step 0.1 (rounded to the penny).
- Stock for a weight product is held in the same unit (kg), so a sale of 0.734 kg takes 0.734 off.
- A weight product can also be **pre-packed** with a fixed weight — then make it a unit product
  ("Cheddar 400g", each) instead; mixing both on one product is not allowed (keeps stock simple).

**Types.** `OrderItem` (`lib/types.ts`) and the `orders.items` JSON type gain:
```ts
sellBy?: "unit" | "weight" | "volume" | "length";
unit?: string;          // snapshot: "kg"
unitPrice?: number;     // snapshot of price per unit, for receipts ("@ £2.40/kg")
```
(`price` stays the per-unit price, `qty` the amount — so totals, tax and reports keep working.)

**Files.** `src/db/schema.ts`, `src/lib/types.ts`, new `src/lib/units.ts`
(`UNITS`, `formatQty(qty, unit)` → "0.734 kg" / "3", `toProductUnit(value, enteredUnit, productUnit)`,
`roundToStep`), `lib/actions/menu.ts` (`DishInput` + validation), `app/manage-dishes/manage-dishes-client.tsx`
(form), Till (step 3.3).

**Do (product form).**
1. New "Sold by" segmented control: **Unit · Weight · Volume · Length** (Volume/Length only when `weighedItems` is on).
2. Unit choice changes with it: Unit → each / pack / box / case; Weight → kg / g (lb / oz if the store setting allows);
   Volume → l / ml; Length → m / cm.
3. Price label follows: "Price per kg". Show "= £0.24 per 100 g" underneath (unit price for shelf labels).
4. Weight extras (collapsed): smallest sale, rounding step, tare.
5. Category defaults: when a category is marked "sold by weight" (new optional `categories.default_sell_by`),
   new products in it start as weight products.
6. Product list shows "£2.40 / kg" vs "£0.89" and a small ⚖ icon for weight products.

**Done when.** Create "Bananas loose — Weight — kg — £0.90"; it shows "£0.90 / kg"; its stock
item is in kg; a sale of 1.250 kg totals £1.13 (1.125 → rounds to 1.13).

**Docs.** FAQ (setup): "How do I sell something by weight?" with a marked product-form screenshot.

---

## Step 2.2 — Barcodes (several per product)

**Goal.** Products have one or more barcodes (the single item, a multipack, the outer case),
checked as they're typed or scanned, and the store can make its own barcodes for products that
have none.

**Schema.**
```sql
CREATE TABLE product_barcodes (
  id text PRIMARY KEY,
  restaurant_id text NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  dish_id text NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  variant_id text,                       -- step 5.1
  code text NOT NULL,
  symbology text NOT NULL,               -- ean13 | ean8 | upca | upce | gtin14 | code128 | internal
  pack_qty real NOT NULL DEFAULT 1,      -- scanning the case barcode adds 12
  created_at integer NOT NULL
);
CREATE UNIQUE INDEX product_barcodes_code_idx ON product_barcodes (restaurant_id, code);
CREATE INDEX product_barcodes_dish_idx ON product_barcodes (dish_id);
```

**Files.** `src/db/schema.ts`; new `src/lib/barcode.ts`; `lib/actions/menu.ts` (save barcodes
with the product, return a clear error on a duplicate); `lib/data/menu.ts` or wherever dishes are
listed (join barcodes); `app/manage-dishes/manage-dishes-client.tsx` (Barcodes field).

**`lib/barcode.ts`.**
- `normaliseCode(raw)` — trim, drop spaces, keep leading zeros.
- `detectSymbology(code)` — 8 digits → EAN-8, 12 → UPC-A, 13 → EAN-13, 14 → GTIN-14, else Code 128.
- `isValidGtin(code)` — GS1 mod-10 check digit (weights 3/1 from the right).
- `upcToEan13(code)` — UPC-A is EAN-13 with a leading 0; store EAN-13 so both scan the same.
- `makeInternalEan13(restaurantId, seq)` — store's own codes in the GS1 in-store range
  (prefix `20` + 10-digit sequence + check digit), never clashing with manufacturer codes or with the scale-label prefixes (21–29, step 3.2).
  Sequence per store (`restaurants.barcode_seq`, see below).
- `parseEmbedded(code, settings)` — step 3.2.

```sql
ALTER TABLE restaurants ADD COLUMN barcode_seq integer NOT NULL DEFAULT 0;
```

**Do (product form).**
1. "Barcodes" list: type or **scan** into the field (a scanner types + Enter); each row shows the
   code, its type (EAN-13…), a ✓ if the check digit is valid, pack quantity, remove.
2. Wrong check digit → red "This barcode's check digit is wrong — scan it again"; Code 128 has no check.
3. Duplicate in this store → "Already used by *Milk 1L*" with a link.
4. "Make a barcode" button → internal EAN-13, shown as a barcode image (rendered client-side,
   e.g. with an SVG barcode library) ready for labels (2.6).
5. Search box in the product list also matches barcodes and SKUs.

**Done when.** Adding 5000112637922 shows "EAN-13 ✓"; changing the last digit is rejected; adding
it to a second product is refused naming the first; "Make a barcode" gives a valid 20… code.

**Docs.** FAQ (setup): "How do I add barcodes to my products?"; screenshot.

---

## Step 2.3 — SKU, cost price, VAT override, minimum age

**Goal.** The information shops need for margin, VAT and age-restricted sales.

**Schema.**
```sql
ALTER TABLE dishes ADD COLUMN sku text;
ALTER TABLE dishes ADD COLUMN cost_price real;          -- per unit of sale (per kg for weight items)
ALTER TABLE dishes ADD COLUMN tax_rate_override real;   -- null = use the category's rate
ALTER TABLE dishes ADD COLUMN min_age integer;          -- 16, 18, 21, 25 or null
ALTER TABLE dishes ADD COLUMN brand text;
ALTER TABLE dishes ADD COLUMN supplier_id text;         -- step 4.4
CREATE UNIQUE INDEX dishes_restaurant_sku_idx ON dishes (restaurant_id, sku) WHERE sku IS NOT NULL;
```

**Files.** `src/db/schema.ts`, `lib/actions/menu.ts`, product form, the Till's `taxRateFor(dish)`
(use the override first), kiosk/online equivalents.

**Do.**
1. Product form "More" section: SKU, brand, cost price (shows margin % and £ live), VAT (category default / 0 / 5 / 20 / custom), age restriction (none / 16 / 18 / 21 / 25 Challenge).
2. Tax snapshot on the order line uses override → category → 0.
3. Cost is snapshotted on the order line (`OrderItem.cost?`) at sale time so historic margins don't change when the cost does.

**Done when.** A crisps product in a 0% "Cupboard" category with override 20% is charged 20%; margin shows for products with a cost.

**Docs.** FAQ: "How do I set VAT for a single product?", "Age-restricted products".

---

## Step 2.4 — Automatic stock item per product

**Goal.** In a shop, "stock of this product" just works — no separate inventory linking.

**Schema.**
```sql
ALTER TABLE dishes ADD COLUMN track_stock integer NOT NULL DEFAULT 0;
ALTER TABLE inventory_items ADD COLUMN dish_id text;      -- set when the item belongs to one product
ALTER TABLE inventory_items ADD COLUMN cost_price real;
ALTER TABLE inventory_items ADD COLUMN reorder_level real;
ALTER TABLE inventory_items ADD COLUMN reorder_qty real;
```

**Do.**
1. Product form: "Track stock" switch (default on when `stockTracking` is on), "Stock now" and "Low-stock level".
2. On save with tracking on: create (or update) an `inventory_items` row with the product's name and
   unit (`pcs` for unit products, `kg`/`l`/`m` otherwise), `dish_id` set, and link the dish
   (`inventoryItemId`, usage 1). Opening stock writes an `opening` movement (0.2).
3. Renaming the product renames its own stock item; deleting the product asks whether to delete its stock item.
4. Restaurants keep ingredient links as today (a dish can still point at a shared item).

**Done when.** New product "Milk 1L", track stock, 24 in stock → an inventory item "Milk 1L" with
24 pcs and an opening movement; selling 2 leaves 22.

**Docs.** FAQ: "How do I keep track of stock for each product?"

---

## Step 2.5 — CSV import and export

**Goal.** Load or update thousands of products from a spreadsheet; export to edit and re-import.

**Files.** New `app/manage-dishes/import/page.tsx` + client, `lib/actions/product-import.ts`,
`lib/csv.ts` (parse with quotes, BOM, `;` or `,`).

**Columns.** `sku, barcode, barcode2, name, category, sell_by, unit, price, cost_price, vat, min_age,
track_stock, stock, low_stock, brand, supplier, description, image_url` — `sku` or `barcode` is the key
for updates.

**Do.**
1. Upload → preview table with per-row status: new / update / error (bad barcode, unknown unit, price not a number).
2. Options: create missing categories; update existing (matched by SKU, then barcode); set stock (writes `count` movements) or leave stock alone.
3. Import in batches of 200 inside `db.batch`; progress bar; summary "312 added, 58 updated, 4 skipped" with a downloadable error CSV.
4. Export: all products with the same columns (UTF-8 BOM for Excel, like the orders CSV in Reports).
5. Template download with two example rows (one unit, one weight).

**Done when.** A 2,000-row file imports in under a minute; re-importing the export changes nothing; bad rows are listed, good rows still import.

**Docs.** FAQ: "How do I import my products from a spreadsheet?" with the template.

---

## Step 2.6 — Shelf-edge and barcode labels

**Goal.** Print price labels for shelves (with unit price, as UK price marking requires for
weight/volume goods) and barcode stickers for products made in store.

**Files.** New `app/manage-dishes/labels/page.tsx` (print view), `lib/barcode-svg.ts` (or a small
library), print CSS.

**Do.**
1. In the product list: tick products (or "all changed since…") → Print labels.
2. Label types: **Shelf-edge** (name, price, unit price "£0.24 per 100 g", barcode, date) and
   **Product sticker** (name, barcode, price). Sizes: A4 sheets (e.g. 21 or 65 per sheet) — prints from any printer, no setup.
3. Thermal label printers (ZPL/Brother) come in step 7.3.
4. "Price changed" list: products whose price changed since their last label print (store `dishes.label_printed_at`).

```sql
ALTER TABLE dishes ADD COLUMN label_printed_at integer;
```

**Done when.** Printing 21 shelf labels on A4 gives scannable barcodes and correct unit prices.

**Docs.** FAQ: "How do I print shelf labels?"
