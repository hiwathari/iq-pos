"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { integrations, paymentTerminals, printers, restaurants } from "@/db/schema";
import type { IntegrationProvider, PrinterConnection, PrinterKind, PrinterStation } from "@/lib/types";
import { assertPermission, assertRestaurantAccess, requireRestaurantContext, requireSession } from "@/lib/scope";

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


// Which restaurant a printer action applies to. Normally the signed-in restaurant (Settings →
// Printers, needs the "settings" permission). Super Admin → Printers passes `targetRestaurantId`
// instead — only a super_admin, or a regional_admin assigned to that restaurant, may do that.
async function printerScope(targetRestaurantId?: string): Promise<{ restaurantId: string }> {
  if (targetRestaurantId) {
    const session = await requireSession();
    if (session.role !== "super_admin" && session.role !== "regional_admin") throw new Error("Forbidden");
    await assertRestaurantAccess(session, targetRestaurantId);
    const [exists] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.id, targetRestaurantId)).limit(1);
    if (!exists) throw new Error("Restaurant not found");
    return { restaurantId: targetRestaurantId };
  }
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  return { restaurantId };
}

function revalidatePrinters() {
  revalidatePath("/settings");
  revalidatePath("/super-admin/printers");
}

export async function createPrinterAction(input: CreatePrinterInput, targetRestaurantId?: string): Promise<PrinterActionState> {
  const { restaurantId } = await printerScope(targetRestaurantId);
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

  // A Network/WiFi printer added with an IP (optionally ip:port) is ready for local network
  // printing straight away — no separate "Connect Local Network Print" step needed.
  const ipMatch =
    needsConnection && (input.connection === "Network" || input.connection === "WiFi")
      ? input.address?.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/)
      : null;

  await db.insert(printers).values({
    id: crypto.randomUUID(),
    restaurantId,
    name: input.name.trim(),
    station: input.station,
    kind: input.kind,
    connection: needsConnection ? (input.connection ?? null) : null,
    address: needsConnection ? input.address?.trim() || null : null,
    pin: needsPin ? pin : null,
    localPrinterIp: ipMatch ? ipMatch[1] : null,
    localPrinterPort: ipMatch?.[2] ? Number(ipMatch[2]) : null,
  });
  revalidatePrinters();
  return {};
}

export async function togglePrinterActiveAction(printerId: string, active: boolean, targetRestaurantId?: string) {
  const { restaurantId } = await printerScope(targetRestaurantId);
  await db
    .update(printers)
    .set({ active })
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePrinters();
}

export async function deletePrinterAction(printerId: string, targetRestaurantId?: string) {
  const { restaurantId } = await printerScope(targetRestaurantId);
  await db.delete(printers).where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePrinters();
}

// Saving a non-empty IP doesn't call anything external (unlike Sunmi's printerAdd) — raw network
// printing has no account/binding step, so this just records where to send bytes. Validate at
// save time with a quick connection check isn't done here since the printer may be briefly
// offline without that being this field's problem; use "Test Print" to actually confirm.
export async function saveLocalPrinterAction(printerId: string, ip: string, port: string, targetRestaurantId?: string): Promise<PrinterActionState> {
  const { restaurantId } = await printerScope(targetRestaurantId);
  const trimmedIp = ip.trim();
  const parsedPort = port.trim() ? Number(port.trim()) : null;
  if (parsedPort !== null && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
    return { error: "Port must be a number between 1 and 65535." };
  }
  await db
    .update(printers)
    .set({ localPrinterIp: trimmedIp || null, localPrinterPort: trimmedIp ? parsedPort : null })
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePrinters();
  revalidatePath("/order-line");
  return {};
}

// The explicit switch for "the Till auto-prints receipts to this printer, not the browser popup"
// — see printers.tillReceiptPrinter in schema.ts for why this is separate from isDefault. Turning
// one printer on clears every other printer's flag first, same single-selection pattern as
// setDefaultPrinterAction, since only one printer can be the Till's receipt target at a time.
export async function setTillReceiptPrinterAction(printerId: string, enabled: boolean, targetRestaurantId?: string): Promise<PrinterActionState> {
  const { restaurantId } = await printerScope(targetRestaurantId);
  if (enabled) {
    const [printer] = await db
      .select({ localPrinterIp: printers.localPrinterIp })
      .from(printers)
      .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)))
      .limit(1);
    if (!printer?.localPrinterIp) return { error: "Save this printer's local IP first." };
    await db.update(printers).set({ tillReceiptPrinter: false }).where(eq(printers.restaurantId, restaurantId));
  }
  await db
    .update(printers)
    .set({ tillReceiptPrinter: enabled })
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePrinters();
  revalidatePath("/order-line");
  return {};
}

export async function setDefaultPrinterAction(printerId: string, targetRestaurantId?: string) {
  const { restaurantId } = await printerScope(targetRestaurantId);
  await db.update(printers).set({ isDefault: false }).where(eq(printers.restaurantId, restaurantId));
  await db
    .update(printers)
    .set({ isDefault: true })
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePrinters();
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
