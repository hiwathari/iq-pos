import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export async function listStaff(restaurantId: string) {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      active: users.active,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.restaurantId, restaurantId), inArray(users.role, ["admin", "staff"])));
}
