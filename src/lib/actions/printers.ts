"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { integrations, paymentTerminals, printers } from "@/db/schema";
import type { IntegrationProvider, PrinterConnection, PrinterKind, PrinterStation } from "@/lib/types";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";

export interface CreatePrinterInput {
  name: string;
  station: PrinterStation;
  kind: PrinterKind;
  connection?: PrinterConnection;
  address?: string;
  pin?: string;
}

export interface PrinterActionState {
  error?: string;
}

export async function createPrinterAction(input: CreatePrinterInput): Promise<PrinterActionState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  if (!input.name.trim()) return { error: "Enter a name." };

  const needsPin = input.kind !== "printer";
  const needsConnection = input.kind !== "display";
  const pin = input.pin?.trim() ?? "";

  if (needsPin) {
    if (!/^\d{6}$/.test(pin)) return { error: "Enter a 6-digit PIN for this display." };
    const [existing] = await db.select({ id: printers.id }).from(printers).where(eq(printers.pin, pin)).limit(1);
    if (existing) return { error: "That PIN is already used by another display — pick a different one." };
  }
  if (needsConnection && !input.connection) return { error: "Choose a connection type." };

  await db.insert(printers).values({
    id: crypto.randomUUID(),
    restaurantId,
    name: input.name.trim(),
    station: input.station,
    kind: input.kind,
    connection: needsConnection ? (input.connection ?? null) : null,
    address: needsConnection ? input.address?.trim() || null : null,
    pin: needsPin ? pin : null,
  });
  revalidatePath("/settings");
  return {};
}

export async function togglePrinterActiveAction(printerId: string, active: boolean) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db
    .update(printers)
    .set({ active })
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

export async function deletePrinterAction(printerId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db.delete(printers).where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

export async function setDefaultPrinterAction(printerId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db.update(printers).set({ isDefault: false }).where(eq(printers.restaurantId, restaurantId));
  await db
    .update(printers)
    .set({ isDefault: true })
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePath("/settings");
  revalidatePath("/manage-dishes");
}

export async function createPaymentTerminalAction(name: string, logoUrl?: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  if (!name.trim()) return;
  await db.insert(paymentTerminals).values({
    id: crypto.randomUUID(),
    restaurantId,
    name: name.trim(),
    logoUrl: logoUrl?.trim() || null,
  });
  revalidatePath("/settings");
  revalidatePath("/order-line");
}

export async function updatePaymentTerminalAction(terminalId: string, name: string, logoUrl?: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  if (!name.trim()) return;
  await db
    .update(paymentTerminals)
    .set({ name: name.trim(), logoUrl: logoUrl?.trim() || null })
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)));
  revalidatePath("/settings");
  revalidatePath("/order-line");
}

export async function togglePaymentTerminalActiveAction(terminalId: string, active: boolean) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db
    .update(paymentTerminals)
    .set({ active })
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)));
  revalidatePath("/settings");
  revalidatePath("/order-line");
}

// The one terminal whose sales the "accounts" role sees in full, same as Cash — see
// lib/accounts-filter.ts. Only one per restaurant, same unset-then-set pattern as printers.
export async function setDefaultPaymentTerminalAction(terminalId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db.update(paymentTerminals).set({ isDefault: false }).where(eq(paymentTerminals.restaurantId, restaurantId));
  await db
    .update(paymentTerminals)
    .set({ isDefault: true })
    .where(and(eq(paymentTerminals.id, terminalId), eq(paymentTerminals.restaurantId, restaurantId)));
  revalidatePath("/settings");
}

export async function deletePaymentTerminalAction(terminalId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
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
  await assertPermission(session, "settings");
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
