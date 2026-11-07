# Docs and FAQ still to write

The owner decided (2026-11-02) that FAQ answers, marked screenshots and Developer Guide entries
for new work can be written **after** the build, in one go, instead of with every change. This
file is the list of what is still owed. Every reply that builds something ends by restating it.
When an item is done, delete it from here. (CLAUDE.md rules 1–2 still apply in the end: nothing
is "documented" until the FAQ, `public/help/` screenshots and Developer Guide §14 + the numbered
section all cover it.)

SQL for schema changes is **not** deferred — it is always handed over before the code is pushed.

## Owed

SQL for Kitchen Recall: `phase8-recall.sql` — orders.recalled_at (has been run). (Phase 7's `phase7.sql` has been run.)

Old note, SQL for Phase 7: `phase7.sql` — restaurants.returns_policy, restaurants.label_printer. (`phase6.sql` and `phase5.sql` have been run.)

Old note, Phase 6: `phase6.sql` — stock_locations, stock_levels, stock_batches, trade_accounts, trade_payments, stock_transfers, till_devices; new columns on restaurants (plan), dishes (tier_prices, master_id, local_price), orders (trade_account_id, pick_status, dispatched_at, carrier, tracking). (Phase 5's `phase5.sql` has been run.)

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
- **6.1–6.2 Locations, bins and batches/expiry** — `/locations` (feature switch `locations`/`batches`): shelves/bins per product, move stock between bins, QR bin labels (`/locations/labels`), Goods in takes bin + lot + expiry, `/inventory/expiry` (expiring soon, write-off); stock sold comes off the biggest bin / earliest expiry first. Screenshots: Locations page, Goods in with lot/expiry, Expiry page, bin labels.
- **6.3 Trade accounts** — `/trade-accounts` (+ statement page, feature switch `tradeAccounts`): company, VAT no., price tier, credit limit, payment terms, hold; product form has trade price tiers; Till has a Trade account selector + "On account" payment (refused over credit limit / on hold); payments and statements, aged debt; invoice shows Bill to / VAT / due date; refunds "On account" = credit note. Screenshots: accounts list, statement, Till with trade account, invoice.
- **6.4 Picking & dispatch** — `/picking` (feature switch `picking`): Delivery / Click & collect orders in bin walking order, scan to tick, wrong item refused, mark short, pack, dispatch with carrier + tracking, printable delivery note. Screenshots: picking list, dispatch popup, delivery note.
- **6.5 Stock transfers** — `/transfers` (regional / super admin logins): draft, send (stock leaves), receive at the other site (matched by barcode, SKU, then name; differences recorded; "create missing" option). Screenshots: transfer list, receive screen.
- **6.6 Sites overview, plans & till licences** — Super Admin → "Sites & plans" (`/super-admin/sites`; plan Basic 1 till / Standard 3 / Premium unlimited; revoke a till), regional admin "Sites overview"; a PIN till sign-in on a new device is refused past the plan limit ("Till limit reached"). Screenshots: sites page.
- **6.7 Central catalogue** — `/catalogue` (only when a login manages 2+ sites): push products to other sites as linked copies (category by name, barcodes, own stock item, "update prices" option, "keeps its own price" per site). Screenshots: catalogue page.
- **Fixes to mention in the changelog** — End Day no longer shows a false "Store credit short" alert (Store credit and On account are off-terminal tenders); sidebar "Catalogue" item no longer renamed to "Products".
- Existing FAQ answers to re-check for Phase 6: "How do I take a refund" (On account credit note), Settings → Team permissions list (Locations, Picking, Trade Accounts, Transfers), business-type switches (locations, batches, picking, trade accounts).
- **Stock panel with counts (Kitchen Display + Till)** — the Kitchen Display **Stock** button now opens a panel with a count for every item: − / + buttons and a box to type the number (Enter or tap away to save). Counts go down automatically as orders are taken (it is the product's own stock item — same engine and history as the Stock page; changes are logged with the staff name). An item nobody has counted stays as it was; its first + or a typed number starts counting it. 0 marks it out of stock, any count above 0 puts it back in stock; the In/Out pill still works. Products with sizes/options and dishes that draw on an ingredient's stock show a note to use the Stock page instead. The Till gets the same **Stock** button (top right, beside Sound / Fullscreen / Refresh). Open to every login that can use the Till or Kitchen, staff included — no extra permission. `lib/actions/stock-quick.ts`, `components/stock-count-modal.tsx`. FAQ: update the Kitchen Display "mark out of stock" answers and add "How do I count stock on the Till?". Screenshots: Kitchen Stock panel, Till Stock button + panel. No SQL.
- **Kitchen Display: Recall** — every non-voided ticket in the Completed list has a **Recall** button; it puts the ticket back on the Pending board (status In Kitchen) with all items un-ticked, and clears its served time. A recalled ticket is shown with a red background and a red RECALLED banner on top until it is completed again (`orders.recalled_at`, SQL in `phase8-recall.sql`). `recallOrderAction` in `lib/actions/orders.ts`, `CompletedOrderRow` in `app/kitchen/kitchen-client.tsx`. FAQ: update the Kitchen Display answers (completed list / marking an order complete by mistake). Screenshot: Completed list with the Recall button. No SQL.
- **7.1 Shop reports** — Reports → new **Shop** group (shown for shops/warehouses, i.e. when the Stock/purchasing feature is on): Shop Dashboard (net sales, transactions, average basket, items per basket, refunds, margin, stock value, low/negative stock, best sellers), Margin (by product / category / supplier / staff — uses each product's cost price *today*), Stock Value (by category and by bin), Stock Movements, Stock Losses, Dead Stock (+ days of cover), Weight Sold, Refunds (reason / method / staff / product), Promotions, Age Checks, Supplier Spend, Expiry, Trade Debt (aged 30/60/90), All Sites (regional / super logins). Each table sorts on a header click and has Export CSV. Tables / Kitchen Speed / Bookings tabs are hidden when those features are off. `lib/data/shop-reports.ts`, `app/reports/shop-tabs.tsx`. Screenshots: Shop group tab bar, Shop Dashboard, Margin, Dead Stock, Expiry.
- **7.2 Shop receipts** — receipts (ESC/POS and browser print) and the invoice page now show "You saved £x", a VAT summary by rate, a returns policy (Settings → Invoice Details → Returns Policy, new), the order number as a Code 128 barcode (`IQ` + order number) on the printed receipt, and the cash drawer opens on a sale with cash (ESC/POS). Scanning that barcode on an empty Till opens the sale (then the refund button). Not built: a refund slip over ESC/POS (refund slips still print through the browser). Screenshots: printed receipt with VAT summary + barcode, Settings returns policy, scanning a receipt.
- **7.3 Label printers** — Settings → **Label printer** (shops only): IP, port, language (ZPL for Zebra / TSPL for TSC, Xprinter…), label size, resolution, "Print a test label"; Print labels page and Bin labels page get **Send to label printer**. Goes through the existing print bridge / Android app. Not built: Brother QL and Dymo (print those from the A4 pages with their driver). `lib/label-printer.ts`. Screenshots: Settings Label printer, Send to label printer button.
- **7.4 Website** — new **Retail & grocery** product page on iq.luvder.com (`lib/site/products.ts`), Pricing plan wording aligned with what is live (`lib/site/pricing.ts`). No FAQ screenshots needed; Developer Guide entry only.
- Existing FAQ answers to re-check when documenting (Phase 5): "How do I refund or take a return?" (mention Store credit),
  "How do I sell by scanning barcodes?" (store-credit slips), "Which business type…" (Promotions switch),
  Settings → Team permissions list (Promotions).

### Not built yet
- Website builder (owner's decisions, 2026-11-02): Stripe payment before the final build — £4.99 for the first
  generation, £1.00 for each later change (GBP); Super Admin coupon codes with expiry date/time and a use limit;
  Google Gemini Flash (free tier via AI Studio, model name kept as a setting, key entered in Super Admin) +
  GrapesJS (free, open source) as the editor/renderer — Gemini output converted to GrapesJS blocks; Claude only
  when an Anthropic key is set, otherwise Gemini + GrapesJS; a strong site-building prompt using the customer's
  chat/form data; the owner will add extra prompt text later
- Four test businesses (Restaurant, Cafe, Retail, Wholesale) — logins are handed to the owner in chat, not documented
