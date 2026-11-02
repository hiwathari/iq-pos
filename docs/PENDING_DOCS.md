# Docs and FAQ still to write

The owner decided (2026-11-02) that FAQ answers, marked screenshots and Developer Guide entries
for new work can be written **after** the build, in one go, instead of with every change. This
file is the list of what is still owed. Every reply that builds something ends by restating it.
When an item is done, delete it from here. (CLAUDE.md rules 1–2 still apply in the end: nothing
is "documented" until the FAQ, `public/help/` screenshots and Developer Guide §14 + the numbered
section all cover it.)

SQL for schema changes is **not** deferred — it is always handed over before the code is pushed.

## Owed

SQL for Phase 5 (all of it): `phase5.sql` — promotions, store_credits, product_variants, serial_numbers, new columns on dishes and inventory_items.

### Built, not yet documented (FAQ answer + marked screenshot + Developer Guide entry/section)
- **5.3 Promotions** — `/promotions` (new sidebar item, permission `promotions`, feature switch `promotions`);
  kinds: multi-buy price, buy N get M free, % off, amount off, bundle / meal deal; live example in the editor;
  applied live on the Till (and the Simple Till), recomputed by the server in `placeOrderAction`
  (`lib/promotions.ts`, `lib/data/promotions.ts`); priced lines carry `fixedTotal` + `promo`; one promotion per
  item, best saving first; weighed / scale-label / manual-price lines excluded; reopening an order re-prices live.
  Screenshots needed: promotions list, the editor (live example), a Till basket showing "saves £0.45".
- **5.4 Gift receipts** — gift icon next to Print on a paid sale: items only, no prices/totals/payments
  (browser print and the ESC/POS bridge). Screenshot needed: the gift icon on the Till cart; receipt text.
- **5.5 Store credit** — refund method "Store credit" issues a slip with an EAN-13 barcode (prefix 29);
  scan the slip on the Till to pay with it (one slip per sale, remainder stays on the slip); a void or Sales
  Records delete gives the credit back. `lib/data/store-credit.ts`, `store_credits` table. Not built: a screen
  to list credits or sell gift cards. End Day lists "Store credit" like a card machine. Screenshot needed:
  the refund popup with Store credit chosen, the slip, a sale with the credit applied.
- **5.1 Variants** — product form: "Comes in sizes, colours or other options" (up to 3 options, up to 200 combinations,
  each with its own SKU, barcode, optional price, stock); Till opens a size/colour picker (shows price and "x left"),
  a scanned variant barcode adds that variant directly, each variant has its own stock item ("Oxford shirt — M / Blue")
  so Stock, Goods in, Stocktake, Reorder work per variant; the Simple Till tells staff to use the full Till for these.
  Not covered yet: variant labels, CSV import columns (`parent_sku`, `option1..3`). Screenshots: the variants grid in
  the product form; the picker on the Till.
- **5.2 Serial / IMEI numbers** — product form checkbox "Track serial / IMEI numbers"; Goods in asks for one serial per
  unit (textarea, scan or type); the Till asks which serial (scan/type/pick); serial printed on receipts, invoice and
  Kitchen/cart; void, delete and refund-back-to-stock release it; Stock → **Serials** page finds a serial and its order.
  Screenshots: Goods in with serials, the serial picker, the Serials page.
- **5.6 Retail online shop** — for shops, `/order/<slug>` has search, size/colour picker, "Only 3 left" / "Out of stock"
  (stock-tracked products only; restaurants never show stock), Click & collect or Delivery (address) instead of tables,
  promotions priced live and again by the server; weighed and serial products are not offered; kiosk and table-QR menus
  hide products with variants. Screenshots: shop page, picker, checkout with Delivery.
- Existing FAQ answers to re-check when documenting: "How do I refund or take a return?" (mention Store credit),
  "How do I sell by scanning barcodes?" (store-credit slips), "Which business type…" (Promotions switch),
  Settings → Team permissions list (Promotions).

### Not built yet
- Phase 6 (warehouse / multi-site), Phase 7 (reports, printing, online)
- Website builder (owner's decisions, 2026-11-02): Stripe payment before the final build — £4.99 for the first
  generation, £1.00 for each later change (GBP); Super Admin coupon codes with expiry date/time and a use limit;
  Google Gemini Flash (free tier via AI Studio, model name kept as a setting, key entered in Super Admin) +
  GrapesJS (free, open source) as the editor/renderer — Gemini output converted to GrapesJS blocks; Claude only
  when an Anthropic key is set, otherwise Gemini + GrapesJS; a strong site-building prompt using the customer's
  chat/form data; the owner will add extra prompt text later
- Four test businesses (Restaurant, Cafe, Retail, Wholesale) — logins are handed to the owner in chat, not documented
