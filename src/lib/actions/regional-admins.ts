"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { restaurantAccess, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { requireSession } from "@/lib/scope";

function assertSuperAdmin(role: string) {
  if (role !== "super_admin") throw new Error("Forbidden");
}

export interface CreateRegionalAdminState {
  error?: string;
}

// A regional_admin is a scoped super admin: full control, but only over the restaurants listed
// in restaurantAccess for them — the actual password comes from the super admin filling this
// form, never generated or seen by anything else.
export async function createRegionalAdminAction(
  _prevState: CreateRegionalAdminState | undefined,
  formData: FormData
): Promise<CreateRegionalAdminState> {
  const session = await requireSession();
  assertSuperAdmin(session.role);

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");
  const restaurantIds = formData.getAll("restaurantIds").map(String);

  if (!name || !email || !password) return { error: "Name, email, and password are required." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) return { error: "That email is already in use." };

  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await db.insert(users).values({
    id: userId,
    email,
    passwordHash,
    name,
    role: "regional_admin",
    restaurantId: null,
  });

  if (restaurantIds.length > 0) {
    await db.insert(restaurantAccess).values(restaurantIds.map((restaurantId) => ({ id: crypto.randomUUID(), userId, restaurantId })));
  }

  revalidatePath("/super-admin");
  return {};
}

export async function updateRegionalAdminAccessAction(userId: string, restaurantIds: string[]) {
  const session = await requireSession();
  assertSuperAdmin(session.role);

  await db.delete(restaurantAccess).where(eq(restaurantAccess.userId, userId));
  if (restaurantIds.length > 0) {
    await db.insert(restaurantAccess).values(restaurantIds.map((restaurantId) => ({ id: crypto.randomUUID(), userId, restaurantId })));
  }
  revalidatePath("/super-admin");
}

export async function toggleRegionalAdminActiveAction(userId: string, active: boolean) {
  const session = await requireSession();
  assertSuperAdmin(session.role);
  await db.update(users).set({ active }).where(and(eq(users.id, userId), eq(users.role, "regional_admin")));
  revalidatePath("/super-admin");
}
