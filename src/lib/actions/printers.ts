"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { integrations, paymentTerminals, printers } from "@/db/schema";
import type { IntegrationProvider, PrinterConnection, PrinterStation } from "@/lib/types";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";

export interface CreatePrinterInput {
  name: string;
  station: PrinterStation;
  connection: PrinterConnection;
  address?: string;
}

export async function createPrinterAction(input: CreatePrinterInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  if (!input.name.trim()) return;
  await db.insert(printers).values({
    id: crypto.randomUUID(),
    restaurantId,
    name: input.name.trim(),
    station: input.station,
    connection: input.connection,
    address: input.address?.trim() || null,
  });
  revalidatePath("/settings");
}

export async function togglePrinterActiveAction(printerId: string, active: boolean) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db
    .update(printers)
    .set({ active })
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

export async function deletePrinterAction(printerId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db.delete(printers).where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

export async function setDefaultPrinterAction(printerId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db.update(printers).set({ isDefault: false }).where(eq(printers.restaurantId, restaurantId));
  await db
    .update(printers)
    .set({ isDefault: true })
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePath("/settings");
  revalidatePath("/manage-dishes");
}

export async function createPaymentTerminalAction(name: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  if (!name.trim()) return;
  await db.insert(paymentTerminals).values({ id: crypto.randomUUID(), restaurantId, name: name.trim() });
  revalidatePath("/settings");
  revalidatePath("/order-line");
}

export async function togglePaymentTerminalActiveAction(terminalId: string, active: boolean) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db
    .update(paymentTerminals)
    .set({ active })
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)));
  revalidatePath("/settings");
  revalidatePath("/order-line");
}

export async function deletePaymentTerminalAction(terminalId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  await db
    .delete(paymentTerminals)
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)));
  revalidatePath("/settings");
  revalidatePath("/order-line");
}

export async function setIntegrationAction(
  provider: IntegrationProvider,
  input: { enabled: boolean; storeId: string; apiKey: string }
) {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  const [existing] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.restaurantId, restaurantId), eq(integrations.provider, provider)));

  if (existing) {
    await db
      .update(integrations)
      .set({ enabled: input.enabled, storeId: input.storeId || null, apiKey: input.apiKey || null })
      .where(eq(integrations.id, existing.id));
  } else {
    await db.insert(integrations).values({
      id: crypto.randomUUID(),
      restaurantId,
      provider,
      enabled: input.enabled,
      storeId: input.storeId || null,
      apiKey: input.apiKey || null,
    });
  }
  revalidatePath("/settings");
}
