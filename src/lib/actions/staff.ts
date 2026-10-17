"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { restaurants, users } from "@/db/schema";
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

export interface UpdateStaffState {
  error?: string;
  success?: boolean;
}

// Lets an admin change a staff member's login name/email/password (e.g. after they change
// their name or lose access to their old email) without needing raw database access.
export async function updateStaffCredentialsAction(
  _prevState: UpdateStaffState | undefined,
  formData: FormData
): Promise<UpdateStaffState> {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);

  const userId = String(formData.get("userId") || "");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") || "");

  if (!userId || !name || !email) return { error: "Name and email are required." };
  if (password && password.length < 8) return { error: "Password must be at least 8 characters." };

  const [target] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.restaurantId, restaurantId)))
    .limit(1);
  if (!target) return { error: "Staff member not found." };

  const [emailTaken] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (emailTaken && emailTaken.id !== userId) return { error: "That email is already in use." };

  const updates: { name: string; email: string; passwordHash?: string } = { name, email };
  if (password) updates.passwordHash = await hashPassword(password);

  await db
    .update(users)
    .set(updates)
    .where(and(eq(users.id, userId), eq(users.restaurantId, restaurantId)));

  // Keeps the restaurant's auto-created "accounts" login's password mirroring its admin's —
  // see createRestaurantAction. Only triggers on an actual admin whose password just changed,
  // never for the accounts user editing itself or a plain staff account.
  if (updates.passwordHash && target.role === "admin") {
    await db
      .update(users)
      .set({ passwordHash: updates.passwordHash })
      .where(and(eq(users.restaurantId, restaurantId), eq(users.role, "accounts")));
  }

  revalidatePath("/settings");
  return { success: true };
}

// Which pages/sections a staff member's login can reach — see lib/permissions.ts. No-op for
// non-staff accounts, which always have full access regardless of this field.
export async function updateStaffPermissionsAction(userId: string, permissions: string[]) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db
    .update(users)
    .set({ permissions })
    .where(and(eq(users.id, userId), eq(users.restaurantId, restaurantId)));
  revalidatePath("/settings");
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

// One PIN per staff member unlocks the Till (/till-login), the Kitchen Display
// (/kitchen-login), and their own full dashboard (/staff-login) — stored in both tillPin and
// kitchenPin (kept as two columns for now rather than a schema migration; always written
// together so they're never out of sync) since each PIN-login screen looks a code up with no
// restaurant context and needs it unique across the whole platform.
export async function generateStaffPinAction(userId: string) {
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
    .set({ tillPin: pin, kitchenPin: pin })
    .where(and(eq(users.id, userId), eq(users.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

export async function clearStaffPinAction(userId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db
    .update(users)
    .set({ tillPin: null, kitchenPin: null })
    .where(and(eq(users.id, userId), eq(users.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

export interface CreateAccountsLoginState {
  error?: string;
}

// Creates the restricted "accounts" login for a restaurant that doesn't have one yet (any
// restaurant onboarded before createRestaurantAction started making it automatically). Same rules
// as at onboarding: accounts@<the admin's domain>, falling back to accounts+<slug>@ if that's
// taken, and the admin's own password hash so the two stay in sync from here on. Restaurant admins
// (and super/regional admins acting as one) only — not the accounts login itself, which would
// otherwise pass assertAdmin.
export async function createAccountsLoginAction(): Promise<CreateAccountsLoginState> {
  const { session, restaurantId } = await requireRestaurantContext();
  if (session.role === "staff" || session.role === "accounts") return { error: "Only an admin can do this." };

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.restaurantId, restaurantId), eq(users.role, "accounts")))
    .limit(1);
  if (existing) return { error: "This restaurant already has an accounts login." };

  const [admin] = await db
    .select({ email: users.email, passwordHash: users.passwordHash })
    .from(users)
    .where(and(eq(users.restaurantId, restaurantId), eq(users.role, "admin")))
    .orderBy(asc(users.createdAt))
    .limit(1);
  const domain = admin?.email.split("@")[1];
  if (!admin || !domain) return { error: "Add a restaurant admin first — the accounts login uses their email domain and password." };

  const [restaurant] = await db
    .select({ name: restaurants.name, slug: restaurants.slug })
    .from(restaurants)
    .where(eq(restaurants.id, restaurantId))
    .limit(1);

  const plainEmail = `accounts@${domain}`;
  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, plainEmail)).limit(1);
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email: taken ? `accounts+${restaurant?.slug ?? restaurantId.slice(0, 6)}@${domain}` : plainEmail,
    passwordHash: admin.passwordHash,
    name: `${restaurant?.name ?? "Restaurant"} Accounts`,
    role: "accounts",
    restaurantId,
  });

  revalidatePath("/settings");
  return {};
}
