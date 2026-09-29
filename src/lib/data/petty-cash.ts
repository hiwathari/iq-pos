import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { pettyCashEntries } from "@/db/schema";

export async function listPettyCashEntries(restaurantId: string, from?: number, to?: number) {
  const conditions = [eq(pettyCashEntries.restaurantId, restaurantId)];
  if (from !== undefined) conditions.push(gte(pettyCashEntries.createdAt, from));
  if (to !== undefined) conditions.push(lt(pettyCashEntries.createdAt, to));
  return db
    .select()
    .from(pettyCashEntries)
    .where(and(...conditions))
    .orderBy(desc(pettyCashEntries.createdAt));
}
