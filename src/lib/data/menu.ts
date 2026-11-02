import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, dishes, productBarcodes } from "@/db/schema";

export async function listCategories(restaurantId: string) {
  return db.select().from(categories).where(eq(categories.restaurantId, restaurantId));
}

export async function listDishes(restaurantId: string) {
  return db.select().from(dishes).where(eq(dishes.restaurantId, restaurantId));
}

// dishId → its barcodes, for Manage Dishes / Products and (later) the Till's scanner.
export async function listBarcodesByDish(restaurantId: string) {
  const rows = await db
    .select({ dishId: productBarcodes.dishId, code: productBarcodes.code, packQty: productBarcodes.packQty })
    .from(productBarcodes)
    .where(eq(productBarcodes.restaurantId, restaurantId));
  const out: Record<string, { code: string; packQty: number }[]> = {};
  for (const r of rows) (out[r.dishId] ??= []).push({ code: r.code, packQty: r.packQty });
  return out;
}

// What customers can order themselves (online, table QR, kiosk): everything except products sold
// by weight / volume / length, which need weighing at the counter (docs/retail-plan step 3.4).
export async function listOrderableDishes(restaurantId: string) {
  return (await listDishes(restaurantId)).filter((d) => d.sellBy === "unit");
}
