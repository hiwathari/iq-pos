# 08 — Phase 7: Reports, printing and online for shops

Part of the [retail plan set](README.md). Grows alongside Phases 2–6.

---

## Step 7.1 — Retail reports

Built in `lib/data/report-insights.ts` / `app/reports/*` (the Reports dashboard from 2026-10-30),
added to `TAB_GROUPS` in `app/reports/report-tabs.ts` and hidden by feature where they don't apply
(Tables and Kitchen Speed hidden when `tables` / `kitchenDisplay` are off).

| Report | Needs | Shows |
|---|---|---|
| Dashboard for shops | 0.1, 3.4 | Net sales, transactions, average basket, items per basket, refunds, margin %, stock value, low/negative stock alerts |
| Margin | 2.3 cost snapshots | Gross profit and margin by product / category / supplier / staff |
| Stock value | 2.4, 4.x | Value at cost and at sale price, by category / location |
| Stock movements | 0.2 | Received, sold, wasted, adjusted, counted — by period |
| Stock losses (shrinkage) | 4.3, 4.6 | Waste + stocktake losses at cost, by reason |
| Dead stock / slow sellers | 0.2 | No sales in 30/60/90 days, days of cover |
| Weight sold | 3.4 | kg / l / m sold per product |
| Refunds | 3.7 | By reason, method, staff, product |
| Promotions | 5.3 | Uses, discount given, uplift |
| Age checks | 3.5 | Approvals / refusals by staff |
| Supplier spend | 4.5 | POs received by supplier and month |
| Expiry | 6.2 | Expiring soon, written off |
| Trade / aged debt | 6.6 | Balances by 30/60/90 days |
| Sales by hour | existing heatmap | For staffing (already on the Dashboard) |
| Multi-site | 6.8 | All sites side by side |

Export CSV on each (same `downloadOrdersCsv` pattern).

---

## Step 7.2 — Receipts for shops

**Files.** `lib/escpos-ticket.ts`, `lib/print-ticket.ts`, `app/invoice/[orderId]`.

**Do.** Footer from the profile ("Thank you for shopping with us!"); weight lines in two rows (3.4);
promotion savings; "You saved £x"; VAT summary by rate (needed when some lines are 0% and others
20%); the order number as a Code 128 barcode for returns; returns policy text (Settings);
refund receipts and gift receipts (3.7, 5.4); serial numbers (5.2); cash drawer kick on cash sales.

---

## Step 7.3 — Label printers

**Do.** Extend the print bridge (`public/downloads/iq-print-bridge.js`, `lib/local-print-bridge.ts`)
with a "label" job type: ZPL for Zebra, Brother/Dymo via their raw modes; templates for shelf-edge,
product sticker, bin label (6.1). A4 sheets (2.6) remain for shops without a label printer.

---

## Step 7.4 — Online for shops

Covered in 5.6: product search, variants, stock, click & collect / delivery slots, no tables.
The website's product pages (`lib/site/products.ts`) gain a "Retail & grocery" product entry and
the Pricing page wording is aligned with what's live (00 §1, Plans row).
