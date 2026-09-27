import { int, sqliteTable, text, real, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = (name = "id") => text(name).primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamp = (name: string) => int(name).notNull().$defaultFn(() => Date.now());

export const restaurants = sqliteTable("restaurants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: int("active", { mode: "boolean" }).notNull().default(true),
  currencySymbol: text("currency_symbol").notNull().default("£"),
  // Minutes an order can sit before its Kitchen Display timer reads fully "red". Color bands
  // (green/yellow/orange/red) are computed as fractions of this value — see kitchen-client.tsx.
  kitchenTimerLimitMinutes: int("kitchen_timer_limit_minutes").notNull().default(30),
  // Printed on the invoice/ticket header — all optional, editable in Settings.
  invoiceAddress: text("invoice_address"),
  invoicePhone: text("invoice_phone"),
  invoiceWebsite: text("invoice_website"),
  invoiceLogoUrl: text("invoice_logo_url"),
  invoiceFooterText: text("invoice_footer_text").notNull().default("Thank you for dining with us!"),
  // This restaurant's brand color (hex, e.g. "#0d9488") — set by Super Admin, applied via a CSS
  // variable to the key surfaces of this tenant's Till/Kitchen/Dashboard (buttons, active states,
  // accents). Null falls back to IQ POS's default teal everywhere, unchanged from today.
  brandColor: text("brand_color"),
  createdAt: timestamp("created_at"),
});

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["super_admin", "admin", "staff"] }).notNull(),
    restaurantId: text("restaurant_id").references(() => restaurants.id, { onDelete: "cascade" }),
    active: int("active", { mode: "boolean" }).notNull().default(true),
    // 6-digit code, set by the restaurant admin, that logs this staff member straight into the Till via /till-login.
    tillPin: text("till_pin"),
    // 6-digit code, set by the restaurant admin, that logs this staff member straight into the
    // Kitchen Display via /kitchen-login — each staff member gets their own, like the Till PIN.
    kitchenPin: text("kitchen_pin"),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("users_email_idx").on(table.email),
    uniqueIndex("users_till_pin_idx").on(table.tillPin),
    uniqueIndex("users_kitchen_pin_idx").on(table.kitchenPin),
  ]
);

export const categories = sqliteTable("categories", {
  id: id(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  icon: text("icon").notNull().default("all"),
  printerId: text("printer_id").references(() => printers.id, { onDelete: "set null" }),
  showOnKitchenDisplay: int("show_on_kitchen_display", { mode: "boolean" }).notNull().default(true),
});

export const dishes = sqliteTable("dishes", {
  id: id(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  categoryId: text("category_id")
    .notNull()
    .references(() => categories.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  price: real("price").notNull(),
  emoji: text("emoji").notNull().default("🍽️"),
  color: text("color").notNull().default("#DCEEE8"),
  description: text("description"),
  // Optional photo URL — shown instead of the emoji tile on the Till and Manage Dishes when set.
  imageUrl: text("image_url"),
  // Per-channel price overrides, e.g. { "Online": 12.5, "Uber Eats": 14 }. Falls back to `price` when absent/null.
  channelPrices: text("channel_prices", { mode: "json" }).$type<Record<string, number>>(),
  // Routes this dish to a specific printer/kitchen station, overriding its category's printer
  // (categories.printerId) — set automatically from the category when the dish is created, but
  // editable per-dish for the odd item that needs a different station (e.g. a dessert routed to
  // the bar printer instead of its category's default).
  printerId: text("printer_id").references(() => printers.id, { onDelete: "set null" }),
  // Marks a dish as temporarily unavailable (kitchen ran out mid-service) — the Till stops
  // taking new orders for it and the Kitchen Display can flip it back on the moment it's
  // restocked, without touching Manage Dishes at all.
  outOfStock: int("out_of_stock", { mode: "boolean" }).notNull().default(false),
});

export const tables = sqliteTable(
  "tables",
  {
    id: id(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    number: int("number").notNull(),
    area: text("area", { enum: ["Ground Floor", "1st Floor", "Basement"] }).notNull(),
    capacity: int("capacity").notNull(),
    status: text("status", { enum: ["available", "reserved", "on-dine"] })
      .notNull()
      .default("available"),
    seated: int("seated").notNull().default(0),
    // When this table became occupied (status turned "on-dine") — drives the occupied-time
    // timer shown on the Till's Tables view. Cleared back to null once the table is freed.
    seatedAt: int("seated_at"),
  },
  (table) => [uniqueIndex("tables_restaurant_number_idx").on(table.restaurantId, table.number)]
);

export const reservations = sqliteTable("reservations", {
  id: id(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  phone: text("phone"),
  time: text("time").notNull(),
  date: text("date").notNull(),
  tableId: text("table_id").references(() => tables.id, { onDelete: "set null" }),
  tableNumber: int("table_number"),
  guests: int("guests").notNull().default(1),
  status: text("status", { enum: ["upcoming", "on-dine", "paid", "unpaid", "available"] })
    .notNull()
    .default("upcoming"),
  meal: text("meal", { enum: ["Breakfast", "Lunch", "Dinner"] }).notNull().default("Dinner"),
  source: text("source", { enum: ["walk-in", "phone", "online"] }).notNull().default("walk-in"),
  createdAt: timestamp("created_at"),
});

export const orders = sqliteTable("orders", {
  id: id(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  orderNumber: text("order_number").notNull(),
  tableId: text("table_id").references(() => tables.id, { onDelete: "set null" }),
  tableNumber: int("table_number"),
  guests: int("guests").notNull().default(1),
  channel: text("channel", {
    enum: ["Dine in", "Wait List", "Take Away", "Delivery", "Online", "Third Party"],
  }).notNull(),
  thirdPartyProvider: text("third_party_provider", { enum: ["Uber Eats", "Deliveroo", "Just Eat", "Other"] }),
  status: text("status", { enum: ["In Kitchen", "Wait List", "Ready", "Served", "Voided"] }).notNull(),
  items: text("items", { mode: "json" }).notNull().$type<
    { dishId: string; name: string; price: number; qty: number; ready?: boolean; note?: string }[]
  >(),
  // "Cash", the name of a payment terminal, or "Split" when paid across multiple methods
  // (see `payments` for the breakdown) — kept for quick display and legacy orders.
  paymentMethod: text("payment_method"),
  // Present when the order was paid across more than one method — e.g. half cash, half a
  // named card terminal. Empty/absent for the common single-method case.
  payments: text("payments", { mode: "json" }).$type<{ method: string; amount: number }[]>(),
  // Cash actually handed over by the customer, when it exceeds the cash portion owed —
  // lets the till show change due. Null when no cash was tendered above the amount due.
  cashReceived: real("cash_received"),
  // Captured for Take Away (name/phone) and Delivery (name/phone/address) orders.
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerAddress: text("customer_address"),
  donation: real("donation").notNull().default(0),
  // Snapshot of who rang up the order (admin/staff/till-PIN session) for staff-level reporting.
  createdByUserId: text("created_by_user_id"),
  createdByName: text("created_by_name"),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at"),
  createdLabel: text("created_label").notNull().default("Just now"),
  // Bumped when an already-sent order's contents (items/payments/table/etc.) are edited —
  // distinct from a plain status change — so Kitchen/Till can flag "this ticket just changed".
  updatedAt: int("updated_at"),
  // When the order's status became "Served" — the Kitchen Display auto-clears a completed
  // ticket about a minute after this so the board doesn't pile up with old tickets.
  servedAt: int("served_at"),
  // Extra table numbers folded into this order via a table merge (e.g. a party spanning two
  // physical tables billed as one ticket) — shown as "Table 03 + 04". Null for the normal case.
  mergedTableNumbers: text("merged_table_numbers", { mode: "json" }).$type<number[]>(),
  // When the order first became fully closed out (Served + paid) — set the moment both
  // conditions are true, cleared if either stops being true. A minute after this, the Till
  // auto-frees the order's table so staff don't have to remember to clear it by hand.
  closedOutAt: int("closed_out_at"),
  // When the order was voided — the Kitchen Display drops a voided ticket off its board about
  // 30 seconds after this (it stays visible on the Till's history for the full audit trail).
  voidedAt: int("voided_at"),
  // A manual, staff-applied discount (flat amount, already resolved from whatever % or fixed
  // entry they used) — frozen at order time so a later edit to how discounts work never
  // reaches back into old orders.
  extraDiscount: real("extra_discount").notNull().default(0),
  // Snapshot of the coupon code used, if any — plain text rather than a foreign key, so
  // deleting or editing a coupon later never disturbs the historical orders that used it.
  couponCode: text("coupon_code"),
  couponDiscount: real("coupon_discount").notNull().default(0),
  // Loyalty member this order is attached to, if the customer was looked up or enrolled at
  // checkout — set null (not deleted) if the member is ever removed.
  loyaltyMemberId: text("loyalty_member_id").references(() => loyaltyMembers.id, { onDelete: "set null" }),
});

// A loyalty/ordering card enrolled against a customer's phone or email. `code` is the
// 7-character value printed/QR-encoded on the card itself (this restaurant's first 2 letters +
// 5 random alphanumeric characters, e.g. "AL3F9K2") — see src/lib/loyalty-code.ts.
export const loyaltyMembers = sqliteTable(
  "loyalty_members",
  {
    id: id(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    contactType: text("contact_type", { enum: ["phone", "email"] }).notNull(),
    // Normalized (trimmed, lowercased for email) so a repeat visit always matches the same
    // member instead of creating a duplicate card.
    contactValue: text("contact_value").notNull(),
    name: text("name"),
    code: text("code").notNull(),
    createdAt: timestamp("created_at"),
  },
  (table) => [
    uniqueIndex("loyalty_members_restaurant_contact_idx").on(table.restaurantId, table.contactValue),
    uniqueIndex("loyalty_members_code_idx").on(table.code),
  ]
);

export const coupons = sqliteTable(
  "coupons",
  {
    id: id(),
    restaurantId: text("restaurant_id")
      .notNull()
      .references(() => restaurants.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    type: text("type", { enum: ["percent", "fixed"] }).notNull(),
    value: real("value").notNull(),
    active: int("active", { mode: "boolean" }).notNull().default(true),
    createdAt: timestamp("created_at"),
  },
  (table) => [uniqueIndex("coupons_restaurant_code_idx").on(table.restaurantId, table.code)]
);

export const printers = sqliteTable("printers", {
  id: id(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  station: text("station", { enum: ["Kitchen", "Bar", "Receipt", "Expo"] }).notNull(),
  connection: text("connection", { enum: ["Bluetooth", "Network", "WiFi", "USB"] }).notNull(),
  address: text("address"),
  active: int("active", { mode: "boolean" }).notNull().default(true),
  isDefault: int("is_default", { mode: "boolean" }).default(false),
});

export const paymentTerminals = sqliteTable("payment_terminals", {
  id: id(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  active: int("active", { mode: "boolean" }).notNull().default(true),
});

export const integrations = sqliteTable("integrations", {
  id: id(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["Uber Eats", "Deliveroo", "Just Eat"] }).notNull(),
  enabled: int("enabled", { mode: "boolean" }).notNull().default(false),
  storeId: text("store_id"),
  apiKey: text("api_key"),
});

export const orderCounters = sqliteTable("order_counters", {
  restaurantId: text("restaurant_id")
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  value: int("value").notNull().default(0),
});

// A closed-out shift/day-end reconciliation, created when a manager taps "End Shift". Covers
// the period since the previous shift's closedAt (or since the restaurant's first order, for
// the very first shift) up to closedAt. Sales figures are frozen at close time rather than
// recomputed later, so a shift's report stays accurate even as newer orders come in.
export const shifts = sqliteTable("shifts", {
  id: id(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  openedAt: int("opened_at").notNull(),
  closedAt: int("closed_at").notNull().$defaultFn(() => Date.now()),
  closedByUserId: text("closed_by_user_id"),
  closedByName: text("closed_by_name"),
  totalSales: real("total_sales").notNull().default(0),
  cashSales: real("cash_sales").notNull().default(0),
  cardSales: real("card_sales").notNull().default(0),
  otherSales: real("other_sales").notNull().default(0),
  orderCount: int("order_count").notNull().default(0),
  voidCount: int("void_count").notNull().default(0),
  voidAmount: real("void_amount").notNull().default(0),
  // What the drawer should hold in cash given cashSales above (assumes it started at zero for
  // the shift — a starting float can be folded in via notes until a dedicated field is needed).
  expectedCash: real("expected_cash").notNull().default(0),
  // What the manager actually counted in the drawer at close — compared against expectedCash
  // on the report to flag any over/short.
  cashCounted: real("cash_counted").notNull().default(0),
  notes: text("notes"),
});
