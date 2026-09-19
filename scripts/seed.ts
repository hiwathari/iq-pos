// Resets the database to a single, clean, non-demo setup: one super admin, one restaurant
// with its admin and one staff member. No sample menu, tables, reservations, or orders —
// the restaurant adds all of that itself once they're in. Safe to re-run: it wipes every
// table first, so running it twice just re-creates the same fresh state (with new PINs).
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
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

// Fixed (not re-randomized on every run) so the credentials handed out alongside this
// script stay valid. Rotate any of these by editing here and re-running `npm run db:seed`.
const CREDENTIALS = {
  superAdmin: { email: "hello@iqpos.app", password: "2kg4KYBkXoovE5" },
  restaurant: { name: "Al Zayt", slug: "al-zayt" },
  admin: { email: "info@alzayt.co.uk", name: "Al Zayt Admin", password: "M7TzBLg2c6ckJ%" },
  staff: {
    email: "ajnas@alzyat.co.uk",
    name: "Ajnas",
    password: "#NLLKpFc@f5Xg7",
    tillPin: "891906",
  },
  kitchenPin: "934236",
};

async function wipeAllData() {
  // Child tables first, respecting foreign keys.
  await db.delete(schema.orders);
  await db.delete(schema.reservations);
  await db.delete(schema.tables);
  await db.delete(schema.dishes);
  await db.delete(schema.categories);
  await db.delete(schema.printers);
  await db.delete(schema.paymentTerminals);
  await db.delete(schema.integrations);
  await db.delete(schema.orderCounters);
  await db.delete(schema.users);
  await db.delete(schema.restaurants);
}

async function main() {
  console.log("Wiping existing data…");
  await wipeAllData();

  console.log("Seeding fresh IQ POS setup…");

  await db.insert(schema.users).values({
    id: uuid(),
    email: CREDENTIALS.superAdmin.email,
    passwordHash: await hash(CREDENTIALS.superAdmin.password),
    name: "Super Admin",
    role: "super_admin",
    restaurantId: null,
  });

  const restaurantId = uuid();
  await db.insert(schema.restaurants).values({
    id: restaurantId,
    name: CREDENTIALS.restaurant.name,
    slug: CREDENTIALS.restaurant.slug,
    kitchenPin: CREDENTIALS.kitchenPin,
  });

  await db.insert(schema.users).values([
    {
      id: uuid(),
      email: CREDENTIALS.admin.email,
      passwordHash: await hash(CREDENTIALS.admin.password),
      name: CREDENTIALS.admin.name,
      role: "admin",
      restaurantId,
    },
    {
      id: uuid(),
      email: CREDENTIALS.staff.email,
      passwordHash: await hash(CREDENTIALS.staff.password),
      name: CREDENTIALS.staff.name,
      role: "staff",
      restaurantId,
      tillPin: CREDENTIALS.staff.tillPin,
    },
  ]);

  // Minimal operational defaults — not demo content — so the till and kitchen routing
  // work the moment the admin adds their first dish.
  const kitchenPrinterId = uuid();
  await db.insert(schema.printers).values({
    id: kitchenPrinterId,
    restaurantId,
    name: "Kitchen Printer",
    station: "Kitchen",
    connection: "Network",
    isDefault: true,
  });

  await db.insert(schema.paymentTerminals).values({ id: uuid(), restaurantId, name: "Card 1" });

  await db.insert(schema.categories).values({
    id: uuid(),
    restaurantId,
    name: "General",
    icon: "all",
    printerId: kitchenPrinterId,
  });

  await db.insert(schema.integrations).values([
    { id: uuid(), restaurantId, provider: "Uber Eats", enabled: false },
    { id: uuid(), restaurantId, provider: "Deliveroo", enabled: false },
    { id: uuid(), restaurantId, provider: "Just Eat", enabled: false },
  ]);

  await db.insert(schema.orderCounters).values({ restaurantId, value: 0 });

  console.log("\nDone. Accounts:");
  console.log(`  Super Admin      ${CREDENTIALS.superAdmin.email} / ${CREDENTIALS.superAdmin.password}`);
  console.log(`  Restaurant Admin ${CREDENTIALS.admin.email} / ${CREDENTIALS.admin.password}`);
  console.log(`  Staff            ${CREDENTIALS.staff.email} / ${CREDENTIALS.staff.password}`);
  console.log(`\nDevice PINs (enter at /till-login or /kitchen-login, no email/password needed):`);
  console.log(`  Till PIN (${CREDENTIALS.staff.name})   ${CREDENTIALS.staff.tillPin}`);
  console.log(`  Kitchen Display PIN     ${CREDENTIALS.kitchenPin}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
