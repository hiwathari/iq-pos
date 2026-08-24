"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { categories, paymentTerminals, printers, restaurants, users } from "@/db/schema";
import { hashPassword, setImpersonatedRestaurant } from "@/lib/auth";
import { assertAdmin, requireRestaurantContext, requireSession } from "@/lib/scope";

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "restaurant"}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface CreateRestaurantState {
  error?: string;
}

export async function createRestaurantAction(
  _prevState: CreateRestaurantState | undefined,
  formData: FormData
): Promise<CreateRestaurantState> {
  const session = await requireSession();
  if (session.role !== "super_admin") return { error: "Forbidden." };

  const name = String(formData.get("name") || "").trim();
  const adminName = String(formData.get("adminName") || "").trim();
  const adminEmail = String(formData.get("adminEmail") || "")
    .trim()
    .toLowerCase();
  const adminPassword = String(formData.get("adminPassword") || "");

  if (!name || !adminName || !adminEmail || !adminPassword) {
    return { error: "All fields are required." };
  }
  if (adminPassword.length < 8) {
    return { error: "Admin password must be at least 8 characters." };
  }

  const [existing] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existing) {
    return { error: "That admin email is already in use." };
  }

  const restaurantId = crypto.randomUUID();
  await db.insert(restaurants).values({ id: restaurantId, name, slug: slugify(name) });

  const passwordHash = await hashPassword(adminPassword);
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email: adminEmail,
    passwordHash,
    name: adminName,
    role: "admin",
    restaurantId,
  });

  const kitchenPrinterId = crypto.randomUUID();
  await db.insert(printers).values({
    id: kitchenPrinterId,
    restaurantId,
    name: "Kitchen Printer",
    station: "Kitchen",
    connection: "Network",
    isDefault: true,
  });

  await db.insert(paymentTerminals).values({ id: crypto.randomUUID(), restaurantId, name: "Card 1" });

  await db.insert(categories).values({
    id: crypto.randomUUID(),
    restaurantId,
    name: "General",
    icon: "all",
    printerId: kitchenPrinterId,
  });

  revalidatePath("/super-admin");
  return {};
}

export async function updateRestaurantCurrencyAction(currencySymbol: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  if (!currencySymbol.trim()) return;
  await db.update(restaurants).set({ currencySymbol: currencySymbol.trim() }).where(eq(restaurants.id, restaurantId));
  revalidatePath("/settings");
  revalidatePath("/order-line");
  revalidatePath("/manage-dishes");
  revalidatePath("/pricing");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
}

export async function toggleRestaurantActiveAction(restaurantId: string, active: boolean) {
  const session = await requireSession();
  if (session.role !== "super_admin") throw new Error("Forbidden");
  await db.update(restaurants).set({ active }).where(eq(restaurants.id, restaurantId));
  revalidatePath("/super-admin");
}

export async function impersonateRestaurantAction(restaurantId: string) {
  const session = await requireSession();
  if (session.role !== "super_admin") throw new Error("Forbidden");
  await setImpersonatedRestaurant(restaurantId);
  redirect("/dashboard");
}

export async function stopImpersonationAction() {
  const session = await requireSession();
  if (session.role !== "super_admin") throw new Error("Forbidden");
  await setImpersonatedRestaurant(null);
  redirect("/super-admin");
}
