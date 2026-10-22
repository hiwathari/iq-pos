import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { websiteRequests } from "@/db/schema";

export type WebsiteRequestRow = typeof websiteRequests.$inferSelect;

// Both return null when the website_requests table doesn't exist yet (its SQL not run), so the
// Super Admin pages degrade to a notice instead of erroring.
export async function listWebsiteRequests(): Promise<WebsiteRequestRow[] | null> {
  try {
    return await db.select().from(websiteRequests).orderBy(desc(websiteRequests.createdAt)).limit(500);
  } catch (error) {
    console.error("[website-requests] list failed", error);
    return null;
  }
}

export async function countNewWebsiteRequests(): Promise<number | null> {
  try {
    const rows = await db.select({ id: websiteRequests.id }).from(websiteRequests).where(eq(websiteRequests.status, "new"));
    return rows.length;
  } catch {
    return null;
  }
}
