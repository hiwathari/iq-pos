"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { dishes, inventoryItems, purchaseOrders, suppliers } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";

// Suppliers (docs/retail-plan step 4.4): who stock is bought from. Each stock item / product can
// have one; Reorder and purchase orders group by it.

export interface SupplierInput {
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  accountRef?: string;
  leadTimeDays?: number | null;
  minOrder?: number | null;
  notes?: string;
}

const clean = (v: unknown, max = 200) => {
  const s = String(v ?? "").trim().slice(0, max);
  return s || null;
};
const optNum = (v: unknown, max: number) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

function values(input: SupplierInput) {
  return {
    name: String(input.name ?? "").trim().slice(0, 120),
    contactName: clean(input.contactName),
    email: clean(input.email, 160),
    phone: clean(input.phone, 60),
    address: clean(input.address, 400),
    accountRef: clean(input.accountRef, 80),
    leadTimeDays: optNum(input.leadTimeDays, 365) === null ? null : Math.round(optNum(input.leadTimeDays, 365)!),
    minOrder: optNum(input.minOrder, 1e7),
    notes: clean(input.notes, 1000),
  };
}

export async function saveSupplierAction(supplierId: string | null, input: SupplierInput): Promise<{ error?: string; id?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "suppliers");
  const v = values(input);
  if (!v.name) return { error: "Enter the supplier's name." };
  if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) return { error: "That email address doesn't look right." };
  if (supplierId) {
    const [row] = await db.update(suppliers).set(v).where(and(eq(suppliers.id, supplierId), eq(suppliers.restaurantId, restaurantId))).returning({ id: suppliers.id });
    if (!row) return { error: "That supplier no longer exists." };
    revalidatePath("/suppliers");
    return { id: row.id };
  }
  const [row] = await db.insert(suppliers).values({ restaurantId, ...v }).returning({ id: suppliers.id });
  revalidatePath("/suppliers");
  revalidatePath("/inventory");
  return { id: row.id };
}

export async function deleteSupplierAction(supplierId: string): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "suppliers");
  const open = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(and(eq(purchaseOrders.restaurantId, restaurantId), eq(purchaseOrders.supplierId, supplierId), inArray(purchaseOrders.status, ["draft", "sent", "part_received"])))
    .limit(1);
  if (open.length) return { error: "This supplier has open purchase orders — receive or cancel them first." };
  await db.update(inventoryItems).set({ supplierId: null }).where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.supplierId, supplierId)));
  await db.update(dishes).set({ supplierId: null }).where(and(eq(dishes.restaurantId, restaurantId), eq(dishes.supplierId, supplierId)));
  await db.delete(suppliers).where(and(eq(suppliers.id, supplierId), eq(suppliers.restaurantId, restaurantId)));
  revalidatePath("/suppliers");
  revalidatePath("/inventory");
  return {};
}
