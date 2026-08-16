"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
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
