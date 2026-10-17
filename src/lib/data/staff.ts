import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

// The restaurant's restricted "accounts" login (see lib/accounts-filter.ts) — kept out of
// listStaff so it can't be edited like a normal staff member; its password always mirrors the
// admin's (see updateStaffCredentialsAction). Null for a restaurant created before it existed.
export async function getAccountsLogin(restaurantId: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email, name: users.name, active: users.active })
    .from(users)
    .where(and(eq(users.restaurantId, restaurantId), eq(users.role, "accounts")))
    .limit(1);
  return row ?? null;
}

export async function listStaff(restaurantId: string) {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      active: users.active,
      tillPin: users.tillPin,
      kitchenPin: users.kitchenPin,
      permissions: users.permissions,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.restaurantId, restaurantId), inArray(users.role, ["admin", "staff"])));
}
