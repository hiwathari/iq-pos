"use server";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { dishes, inventoryItems, productBarcodes, stockTransfers } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { listAccessibleSites } from "@/lib/data/sites";
import { applyStockChanges } from "@/lib/stock";

// Stock transfers between sites under the same owner / regional admin (docs/retail-plan step 6.5):
// draft → sent (stock leaves the source as "transfer_out") → received (arrives as "transfer_in",
// matched to the destination's products by barcode, then SKU, then name; differences recorded).

type Line = typeof stockTransfers.$inferSelect["lines"][number];

async function nextNumber() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` }).from(stockTransfers);
  return `TR${String(Number(n) + 1).padStart(4, "0")}`;
}

export async function saveTransferAction(id: string | null, input: { toRestaurantId: string; lines: { itemId: string; qty: number }[] }): Promise<{ error?: string; id?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "transfers");
  const sites = await listAccessibleSites(session);
  if (input.toRestaurantId === restaurantId || !sites.some((s) => s.id === input.toRestaurantId)) return { error: "Choose another site you manage to send to." };
  const wanted = (Array.isArray(input.lines) ? input.lines : []).filter((l) => l && Number(l.qty) > 0);
  if (wanted.length === 0) return { error: "Add at least one item." };
  const items = await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), inArray(inventoryItems.id, wanted.map((l) => l.itemId))));
  const byId = new Map(items.map((i) => [i.id, i]));
  const dishIds = items.map((i) => i.dishId).filter((d): d is string => !!d);
  const dishRows = dishIds.length ? await db.select({ id: dishes.id, sku: dishes.sku }).from(dishes).where(inArray(dishes.id, dishIds)) : [];
  const codes = dishIds.length ? await db.select({ dishId: productBarcodes.dishId, variantId: productBarcodes.variantId, code: productBarcodes.code }).from(productBarcodes).where(inArray(productBarcodes.dishId, dishIds)) : [];
  const lines: Line[] = [];
  for (const l of wanted) {
    const item = byId.get(l.itemId);
    if (!item) return { error: "One of those items no longer exists." };
    const sku = dishRows.find((d) => d.id === item.dishId)?.sku ?? null;
    const barcode = codes.find((c) => c.dishId === item.dishId && (item.variantId ? c.variantId === item.variantId : !c.variantId))?.code ?? null;
    const existing = lines.find((x) => x.fromItemId === item.id);
    if (existing) existing.qty = Math.round((existing.qty + Number(l.qty)) * 1000) / 1000;
    else lines.push({ name: item.name, unit: item.unit, sku, barcode, fromItemId: item.id, qty: Math.round(Number(l.qty) * 1000) / 1000, received: null });
  }
  if (id) {
    const [row] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.fromRestaurantId, restaurantId))).limit(1);
    if (!row) return { error: "That transfer no longer exists." };
    if (row.status !== "draft") return { error: "Only a draft can be edited." };
    await db.update(stockTransfers).set({ toRestaurantId: input.toRestaurantId, lines }).where(eq(stockTransfers.id, id));
    revalidatePath("/transfers");
    return { id };
  }
  const [row] = await db.insert(stockTransfers).values({ number: await nextNumber(), fromRestaurantId: restaurantId, toRestaurantId: input.toRestaurantId, lines, createdByName: session.name }).returning({ id: stockTransfers.id });
  revalidatePath("/transfers");
  return { id: row.id };
}

export async function sendTransferAction(id: string): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "transfers");
  const [t] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.fromRestaurantId, restaurantId))).limit(1);
  if (!t) return { error: "That transfer no longer exists." };
  if (t.status !== "draft") return { error: `${t.number} has already been ${t.status}.` };
  const items = await db.select().from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), inArray(inventoryItems.id, t.lines.map((l) => l.fromItemId))));
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const l of t.lines) {
    const item = byId.get(l.fromItemId);
    if (!item) return { error: `${l.name} no longer exists here.` };
    if (item.quantity + 1e-9 < l.qty) return { error: `Only ${Math.max(0, Math.round(item.quantity * 1000) / 1000)} ${item.unit} of ${l.name} in stock.` };
  }
  await applyStockChanges(restaurantId, new Map(t.lines.map((l) => [l.fromItemId, -l.qty])), { reason: "transfer_out", referenceId: t.id, byName: session.name, note: `Transfer ${t.number}` });
  await db.update(stockTransfers).set({ status: "sent", sentAt: Date.now() }).where(eq(stockTransfers.id, id));
  revalidatePath("/transfers");
  revalidatePath("/inventory");
  return {};
}

export async function cancelTransferAction(id: string): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "transfers");
  const [t] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.fromRestaurantId, restaurantId))).limit(1);
  if (!t) return { error: "That transfer no longer exists." };
  if (t.status === "received") return { error: "A received transfer can't be cancelled." };
  // Stock already sent goes back to the source.
  if (t.status === "sent") await applyStockChanges(restaurantId, new Map(t.lines.map((l) => [l.fromItemId, l.qty])), { reason: "transfer_in", referenceId: t.id, byName: session.name, note: `Transfer ${t.number} cancelled` });
  await db.update(stockTransfers).set({ status: "cancelled" }).where(eq(stockTransfers.id, id));
  revalidatePath("/transfers");
  revalidatePath("/inventory");
  return {};
}

// Find the destination's stock item for a transferred line: barcode, then SKU, then exact name.
async function matchDestination(restaurantId: string, line: Line) {
  if (line.barcode) {
    const [bc] = await db.select({ dishId: productBarcodes.dishId, variantId: productBarcodes.variantId }).from(productBarcodes).where(and(eq(productBarcodes.restaurantId, restaurantId), eq(productBarcodes.code, line.barcode))).limit(1);
    if (bc) {
      const [it] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.dishId, bc.dishId), bc.variantId ? eq(inventoryItems.variantId, bc.variantId) : sql`${inventoryItems.variantId} is null`)).limit(1);
      if (it) return it.id;
    }
  }
  if (line.sku) {
    const [d] = await db.select({ id: dishes.id }).from(dishes).where(and(eq(dishes.restaurantId, restaurantId), eq(dishes.sku, line.sku))).limit(1);
    if (d) {
      const [it] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.dishId, d.id), sql`${inventoryItems.variantId} is null`)).limit(1);
      if (it) return it.id;
    }
  }
  const [byName] = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.name, line.name))).limit(1);
  return byName?.id ?? null;
}

// Receive at the destination (the person is acting on that site): quantities as counted, items
// the destination doesn't have yet can be created on the spot.
export async function receiveTransferAction(id: string, input: { received: Record<string, number>; createMissing?: boolean }): Promise<{ error?: string; missing?: string[]; differences?: number }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "transfers");
  const [t] = await db.select().from(stockTransfers).where(and(eq(stockTransfers.id, id), eq(stockTransfers.toRestaurantId, restaurantId))).limit(1);
  if (!t) return { error: "That transfer isn't for this site." };
  if (t.status !== "sent") return { error: `${t.number} is ${t.status}, not waiting to be received.` };
  const matched = new Map<string, string>();
  const missing: Line[] = [];
  for (const l of t.lines) {
    const dest = await matchDestination(restaurantId, l);
    if (dest) matched.set(l.fromItemId, dest);
    else missing.push(l);
  }
  if (missing.length && !input.createMissing) return { error: "Some items aren't set up at this site yet.", missing: missing.map((m) => m.name) };
  for (const m of missing) {
    const [created] = await db
      .insert(inventoryItems)
      .values({ restaurantId, name: (await db.select({ id: inventoryItems.id }).from(inventoryItems).where(and(eq(inventoryItems.restaurantId, restaurantId), eq(inventoryItems.name, m.name))).limit(1))[0] ? `${m.name} (transfer)` : m.name, unit: m.unit, quantity: 0 })
      .returning({ id: inventoryItems.id });
    matched.set(m.fromItemId, created.id);
  }
  const changes = new Map<string, number>();
  const lines = t.lines.map((l) => {
    const got = Math.max(0, Math.round(Number(input.received?.[l.fromItemId] ?? l.qty) * 1000) / 1000);
    changes.set(matched.get(l.fromItemId)!, (changes.get(matched.get(l.fromItemId)!) ?? 0) + got);
    return { ...l, received: got };
  });
  await applyStockChanges(restaurantId, changes, { reason: "transfer_in", referenceId: t.id, byName: session.name, note: `Transfer ${t.number}` });
  await db.update(stockTransfers).set({ status: "received", receivedAt: Date.now(), lines }).where(eq(stockTransfers.id, id));
  revalidatePath("/transfers");
  revalidatePath("/inventory");
  return { differences: lines.filter((l) => l.received !== l.qty).length };
}

export async function listTransfersAction() {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "transfers");
  const rows = await db.select().from(stockTransfers).where(or(eq(stockTransfers.fromRestaurantId, restaurantId), eq(stockTransfers.toRestaurantId, restaurantId)));
  return rows;
}
