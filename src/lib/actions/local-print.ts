"use server";

import { requireRestaurantContext } from "@/lib/scope";
import { buildEscPosTicket, type SunmiTicketData } from "@/lib/escpos-ticket";

// Turns the same ticket shape the Till already builds for browser printing (see
// order-line-client.tsx's handlePrint/lib/print-ticket.ts) into raw ESC/POS bytes, hex-encoded,
// ready to hand to the local print bridge (lib/local-print-bridge.ts). Only requires a valid
// session — the ticket content itself is display data the client already holds (the same trust
// level as the existing browser-print path, which has no extra validation either); nothing here
// re-derives or re-prices the order.
export async function buildTicketEscPosAction(ticket: SunmiTicketData): Promise<{ hex: string }> {
  await requireRestaurantContext();
  return buildEscPosTicket(ticket);
}
