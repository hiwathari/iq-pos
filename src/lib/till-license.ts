import "server-only";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { restaurants, tillDevices } from "@/db/schema";
import { PLAN_TILL_LIMIT } from "@/lib/data/site-overview";

// Till licences (docs/retail-plan step 6.8): a PIN till registers itself the first time it signs
// in; a business on a plan can have only as many tills as the plan allows (Basic 1, Standard 3,
// Premium unlimited). A business with no plan set is never limited. Returns an error to show, or
// nothing when the till may sign in.
const COOKIE = "iq_pos_till_device";

export async function registerTillDevice(restaurantId: string): Promise<string | null> {
  const store = await cookies();
  const existingId = store.get(COOKIE)?.value;
  if (existingId) {
    const [d] = await db.select().from(tillDevices).where(and(eq(tillDevices.id, existingId), eq(tillDevices.restaurantId, restaurantId))).limit(1);
    if (d) {
      if (d.revoked) return "This till has been removed from your account — ask your admin.";
      await db.update(tillDevices).set({ lastSeenAt: Date.now() }).where(eq(tillDevices.id, d.id));
      return null;
    }
  }
  const [r] = await db.select({ plan: restaurants.plan }).from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  const active = await db.select({ id: tillDevices.id }).from(tillDevices).where(and(eq(tillDevices.restaurantId, restaurantId), eq(tillDevices.revoked, false)));
  const limit = r?.plan ? (PLAN_TILL_LIMIT[r.plan] ?? null) : null;
  if (limit !== null && active.length >= limit) return `Till limit reached for your ${r!.plan} plan (${limit}) — ask your admin.`;
  const [created] = await db.insert(tillDevices).values({ restaurantId, name: `Till ${active.length + 1}`, lastSeenAt: Date.now() }).returning({ id: tillDevices.id });
  store.set(COOKIE, created.id, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return null;
}
