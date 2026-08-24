import { int, sqliteTable, text, real, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = (name = "id") => text(name).primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamp = (name: string) => int(name).notNull().$defaultFn(() => Date.now());

export const restaurants = sqliteTable("restaurants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: int("active", { mode: "boolean" }).notNull().default(true),
  currencySymbol: text("currency_symbol").notNull().default("£"),
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
    createdAt: timestamp("created_at"),
  },
  (table) => [uniqueIndex("users_email_idx").on(table.email)]
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
  // Per-channel price overrides, e.g. { "Online": 12.5, "Uber Eats": 14 }. Falls back to `price` when absent/null.
  channelPrices: text("channel_prices", { mode: "json" }).$type<Record<string, number>>(),
});

export const tables = sqliteTable("tables", {
  id: id(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  number: int("number").notNull(),
  area: text("area", { enum: ["Main Dining", "Terrace", "Outdoor"] }).notNull(),
  capacity: int("capacity").notNull(),
  status: text("status", { enum: ["available", "reserved", "on-dine"] })
    .notNull()
    .default("available"),
  seated: int("seated").notNull().default(0),
});

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
  items: text("items", { mode: "json" }).notNull().$type<{ dishId: string; name: string; price: number; qty: number }[]>(),
  // "Cash", or the name of a payment terminal (see paymentTerminals) — e.g. "Card 1", "Yellow Card".
  paymentMethod: text("payment_method"),
  donation: real("donation").notNull().default(0),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at"),
  createdLabel: text("created_label").notNull().default("Just now"),
});

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
