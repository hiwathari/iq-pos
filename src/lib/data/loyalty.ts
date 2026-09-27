import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { loyaltyMembers } from "@/db/schema";

export async function listLoyaltyMembers(restaurantId: string) {
  return db.select().from(loyaltyMembers).where(eq(loyaltyMembers.restaurantId, restaurantId)).orderBy(desc(loyaltyMembers.createdAt));
}

export async function findLoyaltyMemberByContact(restaurantId: string, contactValue: string) {
  const [member] = await db
    .select()
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.restaurantId, restaurantId), eq(loyaltyMembers.contactValue, contactValue)))
    .limit(1);
  return member ?? null;
}

export async function findLoyaltyMemberByCode(restaurantId: string, code: string) {
  const [member] = await db
    .select()
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.restaurantId, restaurantId), eq(loyaltyMembers.code, code)))
    .limit(1);
  return member ?? null;
}

export async function findLoyaltyMemberById(restaurantId: string, id: string) {
  const [member] = await db
    .select()
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.restaurantId, restaurantId), eq(loyaltyMembers.id, id)))
    .limit(1);
  return member ?? null;
}
