import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrations, printers } from "@/db/schema";

export async function listPrinters(restaurantId: string) {
  return db.select().from(printers).where(eq(printers.restaurantId, restaurantId));
}

export async function listIntegrations(restaurantId: string) {
  return db.select().from(integrations).where(eq(integrations.restaurantId, restaurantId));
}
