"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { notifications } from "@/db/schema";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";

// The Topbar (and its notification bell) renders on every admin page via AppShell, not just one
// route, so the caller refreshes itself client-side rather than this revalidating a single path.
export async function markAllNotificationsReadAction() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(and(eq(notifications.restaurantId, restaurantId), isNull(notifications.readAt)));
}
