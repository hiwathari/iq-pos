# 09 — Testing and rollout

Part of the [retail plan set](README.md). How every step is checked and shipped.

## 1. Release routine (every step)

1. Write the SQL for the step; run it on a local copy first (`file:` database, as in the local harness).
2. **Run the SQL on Turso before pushing** when it changes an existing table (CLAUDE.md rule 3).
   New tables can go in the same release, but run them first anyway — the code reads them on deploy.
3. `tsc --noEmit`, eslint, `npm run build`.
4. Manual + scripted checks below; restaurant regression (§4).
5. FAQ answers + marked screenshots (`public/help/`), guide sections + §14 changelog entry (with the SQL).
6. Commit, push, check the Vercel deployment is Ready and has no runtime errors, open the changed pages.
7. Tick the step in the README status table.

Features are switched per business (1.1/1.4), so a step can ship to production and be turned on
for one test shop before everyone sees it.

## 2. Unit checks (pure functions)

Kept as small scripts (or a test runner if one is added) for:

| Function | Cases |
|---|---|
| `roundMoney`, `lineTotal` (0.1) | 0.734×2.40=1.76, 0.735×2.40=1.76, 1.125→1.13, 3×0.1=0.30, negatives for refunds |
| `orderBreakdown` | mixed 0% / 20% lines with a discount; totals equal the sum of rounded lines + rounded tax |
| `isValidGtin`, `detectSymbology`, `upcToEan13` (2.2) | real EAN-13/EAN-8/UPC-A codes, one wrong digit, leading zeros kept |
| `makeInternalEan13` | valid check digit, in-store prefix, no duplicates in a sequence |
| `parseEmbedded` (3.2) | price and weight formats, wrong check digit, unknown prefix → not embedded |
| `toProductUnit`, `roundToStep`, `formatQty` (2.1) | 734 g → 0.734 kg, 1.2345 kg step 0.005 → 1.235, "0.734 kg", "3" |
| `stockUsageForItems`, edit difference (0.3) | add, remove, qty change, weight change, product without stock link |
| `applyPromotions` (5.3) | 3 for £2 with 2/3/4/6 items, BOGOF, meal deal, removal un-applies, server = client |
| `businessProfile` (1.1) | every type has every feature; overrides win |

## 3. Scripted end-to-end checks (Playwright, local harness)

Seed a **Demo Grocer** (grocery) and **Demo Boutique** (retail) next to Demo Café, with barcoded,
weighed, age-restricted and variant products.

| Flow | Steps | Expect |
|---|---|---|
| Onboarding | Super Admin creates a grocery | 11 categories with VAT, shop wording, no Kitchen/Tables in sidebar |
| Scan sale | type `5000112637922\n` fast ×3, pay cash | qty 3, receipt, stock −3, sale in History, not on Kitchen Display |
| Unknown barcode | scan unknown code as manager | not-found toast → Add product with barcode filled |
| Weighed sale | tap bananas, type 1250 (g) | 1.250 kg × £0.90 = £1.13; receipt weight line; stock −1.25 kg |
| Embedded barcode | scan a `22…` weight label | correct product and weight |
| Age check | scan beer | prompt; approve once per sale; refusal logged |
| Edit & void | sell 2 → edit to 3 → void | stock −2, −1, +3 back; movements in history |
| Refund | refund 1 of 3 to card, back to stock | refund receipt, stock +1, End Day card total lower |
| Oversell | `block` mode, sell more than in stock | refused naming the product |
| Goods in | scan a case barcode ×2 | +24, cost updated |
| Stocktake | count with a −2 variance, post | stock = counted, loss in Reports |
| CSV import | 2,000 rows incl. 5 bad | 1,995 imported, error file lists 5 |
| Variants | sell shirt M/Blue by scan | only that variant's stock moves |
| Promotion | 3 for £2 | applied on 3rd, removed when one is removed, server total matches |
| Labels | print 21 shelf labels | A4 layout; barcodes scan back to the right product |
| Phone layout | Till, stocktake, goods in at 390 px | usable, no sideways scroll |

## 4. Restaurant regression (run on every step)

The restaurant flows must not change:

- Demo Café sidebar identical; Till dine-in with table and guests; Send to Kitchen; Kitchen Display
  ticks, edits (orange/red) and Complete; Split bill; card terminal overlays.
- End Day totals for a fixed test day identical before and after (0.1 rounding must not move existing totals).
- Reports Dashboard numbers identical for the same range.
- Online / QR / kiosk ordering still place orders.
- Receipt print-out unchanged for whole-unit items.

## 5. Data safety

- Every schema change only **adds** columns/tables; nothing is dropped or renamed.
- Defaults keep current behaviour (`sell_by='unit'`, `track_stock=0`, `negative_stock='allow'`, `features` null).
- Stock changes are idempotent per reference (void twice ≠ double return).
- Before the first Phase 0 release, export `inventory_items` (Turso console) as a backup.

## 6. Docs checklist per phase

| Phase | FAQ answers to add | Screenshots |
|---|---|---|
| 0 | Inventory: voids/edits put stock back; running out of stock setting | inventory |
| 1 | Which business type; feature switches; selling in a shop | super-admin form, settings, shop Till |
| 2 | Sell by weight; barcodes; VAT per product; age-restricted products; track stock; CSV import; shelf labels | product form (units, barcodes), import, labels |
| 3 | Scanning; scale labels; weighed sales; refunds & exchanges; price override | Till scan, weight pad, refund screen |
| 4 | Stock history; goods in; adjustments; suppliers; purchase orders; stocktake; reorder | stock page, goods in, stocktake |
| 5 | Sizes & colours; serial numbers; promotions; gift receipts; store credit | variant grid, promotion editor |
| 6 | Locations; expiry; picking; transfers; trade accounts; till limits | locations, picking screen |
| 7 | New reports; receipts; label printers | reports tabs |
