# 02 — Phase 1: Business types, onboarding and feature switches

Part of the [retail plan set](README.md). Depends on: nothing (can start alongside Phase 0).

---

## Step 1.1 — Business types and one profile helper

**Goal.** A business is a Restaurant, Cafe, Grocery, Retail shop or Warehouse, and every screen
asks one helper what to show and what to call things.

**Schema.** None for the type itself — Drizzle's `enum` on `business_type` is TypeScript-only,
so existing rows and the column stay as they are.
```sql
ALTER TABLE restaurants ADD COLUMN features text;   -- JSON overrides, e.g. {"tables":true}
```

**Files.**
- `src/lib/types.ts` — `BusinessType = "restaurant" | "cafe" | "grocery" | "retail" | "warehouse"`.
- `src/db/schema.ts` — widen the enum; add `features` (`{ mode: "json" }`).
- New `src/lib/business-profile.ts`:

```ts
export type FeatureKey =
  | "tables" | "reservations" | "tableQr" | "kitchenDisplay" | "kitchenTickets"
  | "barcodes" | "weighedItems" | "variants" | "serials" | "ageCheck" | "promotions"
  | "stockTracking" | "suppliers" | "stocktake" | "locations" | "batches"
  | "tradeAccounts" | "picking";

export interface BusinessProfile {
  type: BusinessType;
  label: string;                 // "Grocery shop"
  words: { product: string; products: string; place: string; menu: string };
  // e.g. grocery: { product: "Product", products: "Products", place: "Store", menu: "Products" }
  features: Record<FeatureKey, boolean>;   // defaults per type (README table)
  channels: OrderChannel[];      // grocery/retail: ["In store", "Click & collect", "Delivery", "Online"]
  defaultSellBy: "unit" | "weight";
  receiptFooter: string;         // "Thank you for shopping with us!"
  negativeStock: "allow" | "warn" | "block";
  defaultCategories: { name: string; taxRate: number }[];
}
export function businessProfile(type: BusinessType, overrides?: Partial<Record<FeatureKey, boolean>>): BusinessProfile;
export function hasFeature(restaurant: { businessType: BusinessType; features: ... }, key: FeatureKey): boolean;
```

**Do.**
1. Write the profiles (defaults from the README table).
2. Add `"In store"` and `"Click & collect"` to `OrderChannel` (`lib/types.ts` and the `orders.channel` enum in `db/schema.ts` — TypeScript-only, no SQL).
3. Unit-check: every type returns every feature key.

**Done when.** `businessProfile("grocery").features.tables === false`, `.barcodes === true`;
overrides win over defaults.

**Docs.** Guide §7 new "Business types" section.

---

## Step 1.2 — Onboarding (Super Admin → create business)

**Goal.** Super Admin picks the type when creating a business and it starts with the right
categories, wording, receipt footer and switches.

**Files.** `app/super-admin/create-restaurant-form.tsx`, `lib/actions/restaurants.ts`
(`createRestaurantAction`), `app/super-admin/page.tsx` (list shows the type).

**Do.**
1. The form's Business Type select: Restaurant, Cafe, Grocery shop, Retail shop, Warehouse —
   each with a one-line hint ("Tables & kitchen", "Counter service", "Barcodes, weighed goods, stock", …).
2. Rename the "Restaurant Name" label to "Business name".
3. `createRestaurantAction`: validate the type against the list; insert
   `invoiceFooterText = profile.receiptFooter`, `negativeStock = profile.negativeStock`;
   seed `profile.defaultCategories` (with tax rates) into `categories`.
4. Grocery seed (UK VAT defaults, check per product): Fruit & Veg 0, Bakery 0, Dairy & Eggs 0,
   Meat & Fish 0, Frozen 0, Cupboard 0, Drinks 20, Snacks & Sweets 20, Alcohol 20, Household 20,
   Health & Beauty 20. Retail seed: General 20 (owner renames). Warehouse: General 20.
5. Super Admin list: a type badge per business and a filter.

**Done when.** Creating "Test Grocer" (grocery) gives 11 categories with those rates, the
receipt footer reads "Thank you for shopping with us!", and the admin can sign in.

**Docs.** FAQ (setup): "Which business type should I choose?"; screenshot of the form.

---

## Step 1.3 — Navigation, wording and receipts per type

**Goal.** A shop never sees restaurant words or screens it can't use.

**Files.** `components/sidebar.tsx` (NAV), `lib/permissions.ts` (labels), every page title that
says Dishes/Restaurant/Menu (`app/manage-dishes/*`, `app/settings/*`, `app/dashboard/*`,
`app/help-center/*` intro), `lib/escpos-ticket.ts` / `lib/print-ticket.ts` (receipt header words).

**Do.**
1. `AppShell` / `Sidebar` get the profile (from the restaurant row already loaded for the session).
2. NAV items gain an optional `feature` key; hide when `!hasFeature` — Kitchen Display
   (`kitchenDisplay`), Manage Table (`tables`); later steps add Suppliers, Purchase Orders,
   Stocktake, Locations, Picking with their own feature keys.
3. Labels from `profile.words`: "Manage Dishes" → "Products", "Channel Pricing" → "Prices by channel".
   Routes stay the same (`/manage-dishes`) — only labels change, so links and permissions keep working.
4. Permission labels (`PERMISSION_LABELS`) read the same words in Settings → Staff.
5. The Help Center filters out sections for features that are off (FAQ items get an optional `feature` field).

**Done when.** A grocery admin's sidebar has no Kitchen Display or Manage Table; "Products"
everywhere; a restaurant's sidebar is unchanged (regression check, 09 §4).

**Docs.** FAQ items tagged with features; guide §10 feature map note.

---

## Step 1.4 — Feature switches in Settings

**Goal.** The owner (or Super Admin) turns individual features on or off — e.g. a grocery with a
hot-food counter switches on the Kitchen Display.

**Files.** `app/settings/restaurant-client.tsx` (Business section), `lib/actions/restaurants.ts`
(`updateBusinessTypeAction` → `updateBusinessProfileAction(type, features)`).

**Do.**
1. Business type cards (5) + "Features" list with switches; each shows its default for the type ("default: off").
2. Save writes `business_type` and only the overrides that differ from the defaults into `features`.
3. Changing type asks for confirmation and does **not** delete anything (tables, categories stay; they're just hidden).

**Done when.** Switching Kitchen Display on for a grocery brings the sidebar item back; switching
type from grocery to restaurant restores tables; nothing is lost either way.

**Docs.** FAQ (setup): "How do I turn features on or off?"; re-capture the Settings screenshot.

---

## Step 1.5 — Till and Kitchen behaviour per type

**Goal.** The Till matches the business: no tables or guests in a shop, retail channels, paid
orders finish immediately.

**Files.** `app/order-line/order-line-client.tsx`, `mobile-till-client.tsx`, `till-mode-switcher.tsx`,
`app/order-line/page.tsx` (passes the profile), `lib/actions/orders.ts`.

**Do.**
1. Channel row shows `profile.channels`; default channel "In store" for shops.
2. Hide Tables tab, table picker, guests, "Wait List" when `!tables`.
3. Main button: "Charge £x" (shops) instead of "Send to Kitchen" when `!kitchenDisplay && !kitchenTickets`.
4. `placeOrderAction`: extend the cafe rule — for any type without the kitchen, a fully paid new
   order is created as `Served` (closed out) straight away; an unpaid one stays open in Tickets ("Parked sale").
5. Tickets tab renamed "Parked" for shops (park a sale, serve the next customer, recall it).

**Done when.** On a grocery Till: no tables/guests; channel "In store"; take payment → the sale
is finished, appears in History, not on any kitchen screen; park a sale → it's in Parked and can be recalled.

**Docs.** FAQ (orders): "Selling in a shop" with a marked Till screenshot.
