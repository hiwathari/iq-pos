# Docs and FAQ still to write

The owner decided (2026-11-02) that FAQ answers, marked screenshots and Developer Guide entries
for new work can be written **after** the build, in one go, instead of with every change. This
file is the list of what is still owed. Every reply that builds something ends by restating it.
When an item is done, delete it from here. (CLAUDE.md rules 1–2 still apply in the end: nothing
is "documented" until the FAQ, `public/help/` screenshots and Developer Guide §14 + the numbered
section all cover it.)

SQL for schema changes is **not** deferred — it is always handed over before the code is pushed.

## Owed

SQL file for the not-yet-pushed Phase 5 work so far: `phase5.sql` (promotions, store_credits) — handed over when the batch is ready to push.

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
- Existing FAQ answers to re-check when documenting: "How do I refund or take a return?" (mention Store credit),
  "How do I sell by scanning barcodes?" (store-credit slips), "Which business type…" (Promotions switch),
  Settings → Team permissions list (Promotions).

### Not built yet
- 5.1 Variants, 5.2 Serial numbers, 5.6 Retail online shop
- Phase 6 (warehouse / multi-site), Phase 7 (reports, printing, online)
- Website builder: Gemini Flash / multi-model, payment before build, coupon codes
- Four test businesses (Restaurant, Cafe, Retail, Wholesale) — logins are handed to the owner in chat, not documented
