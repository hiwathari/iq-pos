"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { pettyCashEntries } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";

export async function addPettyCashEntryAction(description: string, amount: number, direction: "in" | "out") {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "reports");
  const trimmed = description.trim().slice(0, 200);
  const clamped = Math.round(Math.abs(amount) * 100) / 100;
  if (!trimmed || clamped <= 0) return { error: "Enter a description and an amount greater than 0." };

  await db.insert(pettyCashEntries).values({
    restaurantId,
    description: trimmed,
    amount: clamped,
    direction,
    createdByName: session.name,
  });
  revalidatePath("/reports");
  return {};
}

export async function deletePettyCashEntryAction(entryId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "reports");
  await db
    .delete(pettyCashEntries)
    .where(and(eq(pettyCashEntries.id, entryId), eq(pettyCashEntries.restaurantId, restaurantId)));
  revalidatePath("/reports");
}
