"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { restaurants, tillDevices } from "@/db/schema";
import { requireSession } from "@/lib/scope";
import { canActOnSite } from "@/lib/data/sites";

// Plans and till licences (docs/retail-plan step 6.8). Setting a plan is Super Admin only; a
// Regional Admin can remove a till from a site they manage.
export async function setPlanAction(restaurantId: string, plan: "basic" | "standard" | "premium" | null): Promise<{ error?: string }> {
  const session = await requireSession();
  if (session.role !== "super_admin") return { error: "Only a Super Admin can change a plan." };
  if (plan !== null && !["basic", "standard", "premium"].includes(plan)) return { error: "Unknown plan." };
  await db.update(restaurants).set({ plan }).where(eq(restaurants.id, restaurantId));
  revalidatePath("/super-admin/sites");
  return {};
}

export async function revokeTillAction(deviceId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  const [d] = await db.select().from(tillDevices).where(eq(tillDevices.id, deviceId)).limit(1);
  if (!d) return {};
  if (!(await canActOnSite(session, d.restaurantId)) || session.role === "staff") return { error: "You can't change that site." };
  await db.update(tillDevices).set({ revoked: true }).where(and(eq(tillDevices.id, deviceId)));
  revalidatePath("/super-admin/sites");
  return {};
}
