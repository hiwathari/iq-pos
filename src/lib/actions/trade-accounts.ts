"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { tradeAccounts, tradePayments } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { roundMoney } from "@/lib/types";

// Trade accounts (step 6.6): create / edit, put on hold, record a payment received.
export interface TradeAccountInput {
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  deliveryAddress?: string;
  vatNumber?: string;
  creditLimit?: number | null;
  paymentTermsDays?: number | null;
  priceTier?: string;
}

const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max) || null;
const optNum = (v: unknown, max: number) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

export async function saveTradeAccountAction(id: string | null, input: TradeAccountInput): Promise<{ error?: string; id?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "trade-accounts");
  const companyName = String(input.companyName ?? "").trim().slice(0, 120);
  if (!companyName) return { error: "Enter the company name." };
  const email = clean(input.email, 160);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return { error: "That email address doesn't look right." };
  const values = {
    companyName,
    contactName: clean(input.contactName),
    email,
    phone: clean(input.phone, 60),
    billingAddress: clean(input.billingAddress, 400),
    deliveryAddress: clean(input.deliveryAddress, 400),
    vatNumber: clean(input.vatNumber, 40),
    creditLimit: optNum(input.creditLimit, 1e8),
    paymentTermsDays: optNum(input.paymentTermsDays, 365) === null ? null : Math.round(optNum(input.paymentTermsDays, 365)!),
    priceTier: clean(input.priceTier, 30)?.toLowerCase() ?? null,
  };
  if (id) {
    const [row] = await db.update(tradeAccounts).set(values).where(and(eq(tradeAccounts.id, id), eq(tradeAccounts.restaurantId, restaurantId))).returning({ id: tradeAccounts.id });
    if (!row) return { error: "That account no longer exists." };
    revalidatePath("/trade-accounts");
    return { id: row.id };
  }
  const [row] = await db.insert(tradeAccounts).values({ restaurantId, ...values }).returning({ id: tradeAccounts.id });
  revalidatePath("/trade-accounts");
  return { id: row.id };
}

export async function setTradeHoldAction(id: string, onHold: boolean) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "trade-accounts");
  await db.update(tradeAccounts).set({ onHold }).where(and(eq(tradeAccounts.id, id), eq(tradeAccounts.restaurantId, restaurantId)));
  revalidatePath("/trade-accounts");
  revalidatePath("/order-line");
}

export async function recordTradePaymentAction(id: string, input: { amount: number; method: string; reference?: string }): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "trade-accounts");
  const amount = roundMoney(Number(input.amount));
  if (!(amount > 0)) return { error: "Enter the amount received." };
  const method = String(input.method ?? "").trim().slice(0, 40) || "Bank transfer";
  const [acc] = await db.select({ id: tradeAccounts.id }).from(tradeAccounts).where(and(eq(tradeAccounts.id, id), eq(tradeAccounts.restaurantId, restaurantId))).limit(1);
  if (!acc) return { error: "That account no longer exists." };
  await db.insert(tradePayments).values({ restaurantId, tradeAccountId: id, amount, method, reference: clean(input.reference, 80), createdByName: session.name });
  await db.update(tradeAccounts).set({ balance: sql`round(${tradeAccounts.balance} - ${amount}, 2)` }).where(eq(tradeAccounts.id, id));
  revalidatePath("/trade-accounts");
  revalidatePath(`/trade-accounts/${id}`);
  return {};
}
