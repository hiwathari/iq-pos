"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { printers } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { bindSunmiPrinter, notifySunmiNewOrder, unbindSunmiPrinter, SunmiPrintApiError } from "@/lib/sunmi-print";
import { buildEscPosTicket } from "@/lib/escpos-ticket";
import { enqueueSunmiPrintJob } from "@/lib/data/sunmi-print";

export interface SunmiActionState {
  error?: string;
}

// Saving a non-empty SN also binds it with Sunmi right away (printerAdd) — so a typo or an
// unregistered SN fails loudly here instead of silently sitting unusable in Settings. Clearing
// the field (empty string) unbinds it.
export async function saveSunmiPrinterSnAction(printerId: string, sn: string): Promise<SunmiActionState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");

  const [printer] = await db
    .select({ sunmiSn: printers.sunmiSn })
    .from(printers)
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)))
    .limit(1);
  if (!printer) return { error: "Printer not found." };

  const trimmed = sn.trim();
  try {
    if (!trimmed) {
      if (printer.sunmiSn) await unbindSunmiPrinter(printer.sunmiSn, restaurantId);
    } else {
      await bindSunmiPrinter(trimmed, restaurantId);
    }
  } catch (err) {
    if (err instanceof SunmiPrintApiError) return { error: err.message };
    throw err;
  }

  await db
    .update(printers)
    .set({ sunmiSn: trimmed || null })
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)));
  revalidatePath("/settings");
  return {};
}

// Queues and triggers a short test ticket — the one way to confirm the whole relay (our outgoing
// notify call, Sunmi's push, the printer's callback to our /api/sunmi/printTicket/* routes, and
// the ESC/POS formatting itself) actually works end to end, before relying on it for real orders.
export async function sendSunmiTestPrintAction(printerId: string): Promise<SunmiActionState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");

  const [printer] = await db
    .select()
    .from(printers)
    .where(and(eq(printers.id, printerId), eq(printers.restaurantId, restaurantId)))
    .limit(1);
  if (!printer?.sunmiSn) return { error: "Save this printer's Sunmi SN first." };

  const { hex, voice } = buildEscPosTicket({
    restaurantName: "IQ POS",
    orderNumber: "TEST",
    createdAt: Date.now(),
    tableNumber: null,
    channel: "Test Print",
    items: [{ name: "Test ticket", qty: 1, price: 0 }],
    subtotal: 0,
    tax: 0,
    total: 0,
    currencySymbol: "",
    footerText: "This is a test print from IQ POS Settings.",
  });

  const jobId = await enqueueSunmiPrintJob({ restaurantId, printerId, escposHex: hex, voiceText: voice });
  try {
    await notifySunmiNewOrder(printer.sunmiSn, jobId);
  } catch (err) {
    if (err instanceof SunmiPrintApiError) return { error: err.message };
    throw err;
  }
  return {};
}
