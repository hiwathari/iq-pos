# Retail, grocery & warehouse plan set

How to turn IQ POS from a restaurant system into one that also runs **grocery shops, general
retail shops and warehouses** — step by step, in the order to build it.

Status: **planned, nothing built yet** (2026-11-01). Tick steps off in the status table as they
ship; each shipped step also gets its dated entry in `docs/DEVELOPER_GUIDE.md` §14.

## The files

| File | What's in it |
|---|---|
| [00-overview.md](00-overview.md) | What the code does today (checked), decisions to make, hardware, UK rules. Read first. |
| [01-foundations.md](01-foundations.md) | Phase 0 — money rounding, stock movement log, stock back on void/edit/delete. Helps restaurants too. |
| [02-business-types.md](02-business-types.md) | Phase 1 — Grocery / Retail / Warehouse business types, onboarding, feature switches, wording. |
| [03-products-units-weight-barcodes.md](03-products-units-weight-barcodes.md) | Phase 2 — products sold **by unit or by weight** (or volume/length), barcodes, VAT override, cost, CSV import, labels. |
| [04-till-retail-selling.md](04-till-retail-selling.md) | Phase 3 — scanning, weighed sales, quantities, age check, price override, refunds & exchanges. |
| [05-stock-control-purchasing.md](05-stock-control-purchasing.md) | Phase 4 — Stock page, goods in, waste, suppliers, purchase orders, stocktake, reorder. |
| [06-general-retail.md](06-general-retail.md) | Phase 5 — what general shops (clothing, gifts, phones, hardware) need on top: variants, serial numbers, promotions, gift receipts, store credit. |
| [07-warehouse-multisite.md](07-warehouse-multisite.md) | Phase 6 — locations, batches & expiry, picking, transfers, trade accounts, central catalogue, till licences. |
| [08-reports-printing-online.md](08-reports-printing-online.md) | Phase 7 — retail reports, receipts & labels, online shop. |
| [09-testing-and-rollout.md](09-testing-and-rollout.md) | How every step is tested, the release routine (SQL → push → verify), regression checks for restaurants. |

## How each step is written

Every step has the same parts so it can be picked up on its own:

- **Goal** — what the owner can do afterwards.
- **Schema** — SQL to run on Turso (changes to existing tables are run *before* the code is pushed — CLAUDE.md rule 3).
- **Files** — what to create or change.
- **Do** — the operations, in order.
- **Done when** — checks that prove it works (also listed in 09).
- **Docs** — FAQ answers / screenshots / guide sections to add (CLAUDE.md rules 1–2).

## Which business type gets what

| Feature | Restaurant | Cafe | Grocery | Retail | Warehouse |
|---|---|---|---|---|---|
| Tables, guests, reservations, table QR | ✓ | optional | — | — | — |
| Kitchen Display / kitchen tickets | ✓ | ✓ | — | — | as Picking screen |
| Products by unit | ✓ | ✓ | ✓ | ✓ | ✓ |
| Products by weight / volume / length | — | optional | ✓ | optional (fabric, rope) | ✓ |
| Barcode scanning | optional | optional | ✓ | ✓ | ✓ |
| Stock per product | via ingredients | via ingredients | ✓ | ✓ | ✓ |
| Variants (size / colour) | — | — | — | ✓ | optional |
| Serial / IMEI numbers | — | — | — | optional | optional |
| Age-check prompt | bar items | — | ✓ | optional | optional |
| Refunds & exchanges | ✓ | ✓ | ✓ | ✓ | ✓ |
| Promotions (multi-buy, bundles) | optional | optional | ✓ | ✓ | — |
| Suppliers & purchase orders | optional | optional | ✓ | ✓ | ✓ |
| Stocktake | optional | optional | ✓ | ✓ | ✓ |
| Locations / bins, batches & expiry | — | — | optional | — | ✓ |
| Trade accounts & credit | — | — | optional | optional | ✓ |

"optional" = off by default for that type, the owner can switch it on in Settings (step 1.4).

## Status

| Step | Title | Status |
|---|---|---|
| 0.1 | Money: line totals rounded to the penny | planned |
| 0.2 | Stock movement log + one stock function | planned |
| 0.3 | Stock back on void / edit / delete / refund | planned |
| 0.4 | Overselling: allow, warn or block | planned |
| 1.1 | Business types + `business-profile.ts` | planned |
| 1.2 | Onboarding (Super Admin) with seeds | planned |
| 1.3 | Navigation, wording, receipts per type | planned |
| 1.4 | Feature switches in Settings | planned |
| 1.5 | Till & Kitchen behaviour per type | planned |
| 2.1 | Sold by unit / weight / volume / length | planned |
| 2.2 | Barcodes (several per product) | planned |
| 2.3 | Cost, VAT override, minimum age, SKU | planned |
| 2.4 | Automatic stock item per product | planned |
| 2.5 | CSV import / export | planned |
| 2.6 | Shelf-edge & barcode labels | planned |
| 3.1 | Scanner input on the Till | planned |
| 3.2 | Price- / weight-embedded barcodes | planned |
| 3.3 | Weighed sales (typed weight) | planned |
| 3.4 | Quantities & units everywhere | planned |
| 3.5 | Age check | planned |
| 3.6 | Price override / reduced to clear | planned |
| 3.7 | Refunds, returns & exchanges | planned |
| 3.8 | Stock left on tiles | planned |
| 3.9 | Camera scanning | planned |
| 3.10 | Scales | planned |
| 4.1–4.8 | Stock page, goods in, waste, suppliers, POs, stocktake, reorder, alerts | planned |
| 5.1–5.6 | Variants, serials, promotions, gift receipts, store credit, retail online shop | planned |
| 6.1–6.8 | Locations, batches/expiry, picking, delivery notes, transfers, trade accounts, central catalogue, till licences | planned |
| 7.1–7.4 | Retail reports, receipts, labels on label printers, online shop | planned |

## Build order (and why)

1. **Phase 0 first** — everything after it changes stock and money; get those right once.
2. **Phase 1** — the business type decides what every later screen shows.
3. **Phase 2 then 3** — products need units and barcodes before the Till can scan or weigh them.
4. **Phase 4** — stock control is only meaningful once sales move stock correctly.
5. **Phase 5** (retail extras) and **6** (warehouse) can run in parallel once 0–4 are done.
6. **Phase 7** reports grow alongside; the big retail reports need cost prices (2.3) and movements (0.2).

A first grocery shop can go live after **0, 1, 2.1–2.5, 3.1–3.4, 3.7 and 4.1–4.3**.
