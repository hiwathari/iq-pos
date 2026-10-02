import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";

export async function listNotifications(restaurantId: string, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.restaurantId, restaurantId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function countUnreadNotifications(restaurantId: string) {
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.restaurantId, restaurantId), isNull(notifications.readAt)));
  return rows.length;
}

export async function createNotification(restaurantId: string, input: { title: string; body: string; link?: string }) {
  await db.insert(notifications).values({ restaurantId, title: input.title, body: input.body, link: input.link ?? null });
}
