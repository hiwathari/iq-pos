import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/db/schema";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url || !authToken) {
  console.error("Missing TURSO_DATABASE_URL / TURSO_AUTH_TOKEN. Set them in .env.local first.");
  process.exit(1);
}

const client = createClient({ url, authToken });
const db = drizzle(client, { schema });

const hash = (pw: string) => bcrypt.hash(pw, 10);
const uuid = () => crypto.randomUUID();

const COLORS = ["#FDE8D7", "#DCEEE8", "#F6DDE3", "#E6E4F7", "#FBEAD1", "#DCEAF7", "#E7F1D8", "#F3E0EE"];
let colorSeed = 0;
const nextColor = () => COLORS[colorSeed++ % COLORS.length];

const CATEGORY_DEFS = [
  { key: "breakfast", name: "Breakfast", icon: "breakfast" },
  { key: "beef", name: "Beef Dishes", icon: "beef" },
  { key: "biryani", name: "Biryani", icon: "biryani" },
  { key: "chicken", name: "Chicken Dishes", icon: "chicken" },
  { key: "desserts", name: "Desserts", icon: "dessert" },
  { key: "dinner", name: "Dinner", icon: "dinner" },
  { key: "drinks", name: "Drinks", icon: "drinks" },
  { key: "fastfood", name: "Fast Foods", icon: "fastfood" },
  { key: "lunch", name: "Lunch", icon: "lunch" },
  { key: "platters", name: "Platters", icon: "platters" },
  { key: "salads", name: "Salads", icon: "salads" },
  { key: "side", name: "Side Dishes", icon: "side" },
  { key: "soups", name: "Soups", icon: "soups" },
] as const;

const DISH_DEFS: { category: (typeof CATEGORY_DEFS)[number]["key"]; name: string; price: number; emoji: string }[] = [
  { category: "breakfast", name: "Belgian Waffles", price: 12, emoji: "🧇" },
  { category: "breakfast", name: "Avocado Toast", price: 9, emoji: "🥑" },
  { category: "breakfast", name: "Eggs Benedict", price: 11, emoji: "🍳" },
  { category: "breakfast", name: "Pancake Stack", price: 8, emoji: "🥞" },
  { category: "breakfast", name: "Granola with Yoghurt", price: 7, emoji: "🥣" },
  { category: "beef", name: "Beef Steak", price: 30, emoji: "🥩" },
  { category: "beef", name: "Beef Wellington", price: 34, emoji: "🥩" },
  { category: "beef", name: "Braised Short Ribs", price: 28, emoji: "🍖" },
  { category: "biryani", name: "Chicken Biryani", price: 13, emoji: "🍛" },
  { category: "biryani", name: "Mutton Biryani", price: 16, emoji: "🍛" },
  { category: "biryani", name: "Vegetable Biryani", price: 11, emoji: "🍛" },
  { category: "chicken", name: "Grilled Chicken Breast", price: 15, emoji: "🍗" },
  { category: "chicken", name: "Butter Chicken", price: 15, emoji: "🍛" },
  { category: "chicken", name: "Honey Glazed Wings", price: 12, emoji: "🍗" },
  { category: "desserts", name: "Cheese Syrniki Pancakes", price: 8, emoji: "🥞" },
  { category: "desserts", name: "Apple Stuffed Pancake", price: 10, emoji: "🥞" },
  { category: "desserts", name: "Terracotta Bowl", price: 12, emoji: "🍮" },
  { category: "desserts", name: "Belgian Waffles Dessert", price: 20, emoji: "🧇" },
  { category: "desserts", name: "Chocolate Lava Cake", price: 9, emoji: "🍫" },
  { category: "dinner", name: "Herb Roasted Chicken", price: 19, emoji: "🍗" },
  { category: "dinner", name: "Lamb Chops", price: 26, emoji: "🍖" },
  { category: "dinner", name: "Mushroom Risotto", price: 16, emoji: "🍚" },
  { category: "drinks", name: "Fresh Orange Juice", price: 5, emoji: "🍊" },
  { category: "drinks", name: "Iced Latte", price: 6, emoji: "☕" },
  { category: "drinks", name: "Mango Smoothie", price: 6, emoji: "🥭" },
  { category: "fastfood", name: "Classic Cheeseburger", price: 11, emoji: "🍔" },
  { category: "fastfood", name: "Loaded Fries", price: 7, emoji: "🍟" },
  { category: "fastfood", name: "Crispy Chicken Sandwich", price: 10, emoji: "🥪" },
  { category: "lunch", name: "Grilled Salmon Steak", price: 15, emoji: "🐟" },
  { category: "lunch", name: "Tofu Poke Bowl", price: 7, emoji: "🥗" },
  { category: "lunch", name: "Pasta with Roast Beef", price: 10, emoji: "🍝" },
  { category: "lunch", name: "Shrimp Rice Bowl", price: 12, emoji: "🍤" },
  { category: "lunch", name: "Vegetable Shrimp", price: 10, emoji: "🍤" },
  { category: "platters", name: "Mixed Grill Platter", price: 32, emoji: "🍖" },
  { category: "platters", name: "Seafood Platter", price: 36, emoji: "🦐" },
  { category: "salads", name: "Caesar Salad", price: 8, emoji: "🥗" },
  { category: "salads", name: "Greek Salad", price: 8, emoji: "🥗" },
  { category: "side", name: "Garlic Mashed Potatoes", price: 5, emoji: "🥔" },
  { category: "side", name: "Garlic Bread", price: 4, emoji: "🍞" },
  { category: "soups", name: "Tomato Basil Soup", price: 6, emoji: "🍅" },
  { category: "soups", name: "Chicken Noodle Soup", price: 7, emoji: "🍜" },
];

async function seedRestaurant(opts: {
  name: string;
  slug: string;
  adminEmail: string;
  adminName: string;
  staffEmail: string;
  staffName: string;
}) {
  const restaurantId = uuid();
  await db.insert(schema.restaurants).values({ id: restaurantId, name: opts.name, slug: opts.slug });

  await db.insert(schema.users).values([
    {
      id: uuid(),
      email: opts.adminEmail,
      passwordHash: await hash("Admin123!"),
      name: opts.adminName,
      role: "admin",
      restaurantId,
    },
    {
      id: uuid(),
      email: opts.staffEmail,
      passwordHash: await hash("Staff123!"),
      name: opts.staffName,
      role: "staff",
      restaurantId,
    },
  ]);

  const categoryIds = new Map<string, string>();
  for (const c of CATEGORY_DEFS) {
    const id = uuid();
    categoryIds.set(c.key, id);
    await db.insert(schema.categories).values({ id, restaurantId, name: c.name, icon: c.icon });
  }

  const dishRows = DISH_DEFS.map((d) => ({
    id: uuid(),
    restaurantId,
    categoryId: categoryIds.get(d.category)!,
    name: d.name,
    price: d.price,
    emoji: d.emoji,
    color: nextColor(),
  }));
  await db.insert(schema.dishes).values(dishRows);

  const tableDefs = [
    { number: 1, area: "Main Dining" as const, capacity: 6, status: "on-dine" as const, seated: 6 },
    { number: 2, area: "Main Dining" as const, capacity: 2, status: "reserved" as const, seated: 2 },
    { number: 3, area: "Main Dining" as const, capacity: 2, status: "on-dine" as const, seated: 2 },
    { number: 4, area: "Main Dining" as const, capacity: 3, status: "reserved" as const, seated: 3 },
    { number: 5, area: "Main Dining" as const, capacity: 4, status: "available" as const, seated: 0 },
    { number: 6, area: "Main Dining" as const, capacity: 7, status: "on-dine" as const, seated: 7 },
    { number: 7, area: "Main Dining" as const, capacity: 10, status: "on-dine" as const, seated: 10 },
    { number: 8, area: "Main Dining" as const, capacity: 2, status: "reserved" as const, seated: 2 },
    { number: 9, area: "Main Dining" as const, capacity: 4, status: "reserved" as const, seated: 4 },
    { number: 10, area: "Terrace" as const, capacity: 4, status: "available" as const, seated: 0 },
    { number: 11, area: "Terrace" as const, capacity: 2, status: "available" as const, seated: 0 },
    { number: 12, area: "Terrace" as const, capacity: 6, status: "reserved" as const, seated: 6 },
    { number: 13, area: "Outdoor" as const, capacity: 4, status: "available" as const, seated: 0 },
    { number: 14, area: "Outdoor" as const, capacity: 6, status: "on-dine" as const, seated: 5 },
  ];
  const tableRows = tableDefs.map((t) => ({ id: uuid(), restaurantId, ...t }));
  await db.insert(schema.tables).values(tableRows);

  const findTable = (n: number) => tableRows.find((t) => t.number === n)!;

  await db.insert(schema.reservations).values([
    {
      id: uuid(),
      restaurantId,
      customerName: "Uthman ibn Hunaif",
      phone: "+84 678 890 000",
      time: "7:30 PM",
      date: "2026-08-16",
      tableId: findTable(1).id,
      tableNumber: 1,
      guests: 6,
      status: "paid",
      meal: "Dinner",
    },
    {
      id: uuid(),
      restaurantId,
      customerName: "Bashir ibn Sa'ad",
      phone: "+84 233 111 222",
      time: "6:45 PM",
      date: "2026-08-16",
      tableId: findTable(3).id,
      tableNumber: 3,
      guests: 2,
      status: "on-dine",
      meal: "Dinner",
    },
    {
      id: uuid(),
      restaurantId,
      customerName: "Mus'ab ibn Umayr",
      phone: "+84 800 563 554",
      time: "8:25 PM",
      date: "2026-08-16",
      tableId: findTable(7).id,
      tableNumber: 7,
      guests: 7,
      status: "unpaid",
      meal: "Dinner",
    },
  ]);

  const dish = (name: string) => dishRows.find((d) => d.name === name)!;
  await db.insert(schema.orders).values([
    {
      id: uuid(),
      restaurantId,
      orderNumber: "F0027",
      tableId: findTable(3).id,
      tableNumber: 3,
      guests: 4,
      channel: "Dine in",
      status: "In Kitchen",
      items: [{ dishId: dish("Classic Cheeseburger").id, name: "Classic Cheeseburger", price: 11, qty: 4 }],
      createdLabel: "2 mins ago",
    },
    {
      id: uuid(),
      restaurantId,
      orderNumber: "F0028",
      tableId: findTable(7).id,
      tableNumber: 7,
      guests: 2,
      channel: "Wait List",
      status: "Wait List",
      items: [{ dishId: dish("Tofu Poke Bowl").id, name: "Tofu Poke Bowl", price: 7, qty: 3 }],
      createdLabel: "Just now",
    },
  ]);

  await db.insert(schema.orderCounters).values({ restaurantId, value: 28 });

  return restaurantId;
}

async function main() {
  console.log("Seeding IQ POS…");

  const [existingSuperAdmin] = await db.select().from(schema.users).where(eq(schema.users.email, "super@iqpos.app"));
  if (existingSuperAdmin) {
    console.log("Database already seeded (super admin exists). Skipping.");
    return;
  }

  await db.insert(schema.users).values({
    id: uuid(),
    email: "super@iqpos.app",
    passwordHash: await hash("SuperAdmin123!"),
    name: "Super Admin",
    role: "super_admin",
    restaurantId: null,
  });

  await seedRestaurant({
    name: "Tasty Station",
    slug: "tasty-station",
    adminEmail: "admin@tastystation.iqpos.app",
    adminName: "Ibrahim Kadri",
    staffEmail: "staff@tastystation.iqpos.app",
    staffName: "Amina Yusuf",
  });

  await seedRestaurant({
    name: "Burger Barn",
    slug: "burger-barn",
    adminEmail: "admin@burgerbarn.iqpos.app",
    adminName: "Jordan Blake",
    staffEmail: "staff@burgerbarn.iqpos.app",
    staffName: "Casey Reed",
  });

  console.log("Done. Demo accounts:");
  console.log("  Super Admin  super@iqpos.app / SuperAdmin123!");
  console.log("  Admin        admin@tastystation.iqpos.app / Admin123!");
  console.log("  Staff        staff@tastystation.iqpos.app / Staff123!");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
