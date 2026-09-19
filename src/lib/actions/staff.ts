"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { generatePin } from "@/lib/pin";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";

export interface CreateStaffState {
  error?: string;
}

export async function createStaffAction(
  _prevState: CreateStaffState | undefined,
  formData: FormData
): Promise<CreateStaffState> {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "staff") === "admin" ? "admin" : "staff";

  if (!name || !email || !password) return { error: "All fields are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: "That email is already in use." };

  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email,
    passwordHash,
    name,
    role,
    restaurantId,
  });

  revalidatePath("/settings");
  return {};
}

export async function toggleStaffActiveAction(userId: string, active: boolean) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db
    .update(users)
    .set({ active })
    .where(and(eq(users.id, userId), eq(users.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

// Till PINs are looked up with no restaurant context (the till-login screen only has a
// 6-digit code to go on), so they must be unique across the whole platform.
export async function generateTillPinAction(userId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);

  let pin = generatePin();
  for (let attempt = 0; attempt < 10; attempt++) {
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.tillPin, pin)).limit(1);
    if (!existing) break;
    pin = generatePin();
  }

  await db
    .update(users)
    .set({ tillPin: pin })
    .where(and(eq(users.id, userId), eq(users.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

export async function clearTillPinAction(userId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db
    .update(users)
    .set({ tillPin: null })
    .where(and(eq(users.id, userId), eq(users.restaurantId, restaurantId)));
  revalidatePath("/settings");
}
