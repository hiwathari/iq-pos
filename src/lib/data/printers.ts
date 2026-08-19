import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { integrations, paymentTerminals, printers } from "@/db/schema";

export async function listPrinters(restaurantId: string) {
  return db.select().from(printers).where(eq(printers.restaurantId, restaurantId));
}

export async function listIntegrations(restaurantId: string) {
  return db.select().from(integrations).where(eq(integrations.restaurantId, restaurantId));
}

export async function listPaymentTerminals(restaurantId: string) {
  return db.select().from(paymentTerminals).where(eq(paymentTerminals.restaurantId, restaurantId));
}
