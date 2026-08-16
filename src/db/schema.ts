import { int, sqliteTable, text, real, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = (name = "id") => text(name).primaryKey().$defaultFn(() => crypto.randomUUID());
const timestamp = (name: string) => int(name).notNull().$defaultFn(() => Date.now());

export const restaurants = sqliteTable("restaurants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  active: int("active", { mode: "boolean" }).notNull().default(true),
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
  channel: text("channel", { enum: ["Dine in", "Wait List", "Take Away"] }).notNull(),
  status: text("status", { enum: ["In Kitchen", "Wait List", "Ready", "Served"] }).notNull(),
  items: text("items", { mode: "json" }).notNull().$type<{ dishId: string; name: string; price: number; qty: number }[]>(),
  paymentMethod: text("payment_method", { enum: ["Cash", "Card", "Scan"] }),
  donation: real("donation").notNull().default(0),
  createdAt: timestamp("created_at"),
  createdLabel: text("created_label").notNull().default("Just now"),
});

export const orderCounters = sqliteTable("order_counters", {
  restaurantId: text("restaurant_id")
    .primaryKey()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  value: int("value").notNull().default(0),
});
