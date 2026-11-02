import "server-only";
import { and, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { storeCredits } from "@/db/schema";
import { gtinCheckDigit } from "@/lib/barcode";
import { roundMoney } from "@/lib/types";

// Store credit (docs/retail-plan step 5.5). A credit's code is an EAN-13 starting 29 (the
// business's own refund-slip range), so the slip's barcode scans on the Till like a product.
export const CREDIT_PREFIX = "29";
export const isCreditCode = (code: string) => /^29\d{11}$/.test(code);

function newCode() {
  let body = CREDIT_PREFIX;
  while (body.length < 12) body += Math.floor(Math.random() * 10);
  return body + gtinCheckDigit(body);
}

export async function issueStoreCredit(restaurantId: string, amount: number, opts: { customerName?: string | null; sourceOrderId?: string | null; byName?: string | null; expiresAt?: number | null } = {}) {
  const value = roundMoney(amount);
  for (let tries = 0; tries < 10; tries++) {
    const code = newCode();
    const [taken] = await db.select({ id: storeCredits.id }).from(storeCredits).where(and(eq(storeCredits.restaurantId, restaurantId), eq(storeCredits.code, code))).limit(1);
    if (taken) continue;
    await db.insert(storeCredits).values({
      restaurantId,
      code,
      balance: value,
      original: value,
      customerName: opts.customerName ?? null,
      sourceOrderId: opts.sourceOrderId ?? null,
      expiresAt: opts.expiresAt ?? null,
      createdByName: opts.byName ?? null,
    });
    return { code, amount: value };
  }
  throw new Error("Couldn't make a free store-credit code.");
}

export async function findStoreCredit(restaurantId: string, code: string) {
  const [row] = await db.select().from(storeCredits).where(and(eq(storeCredits.restaurantId, restaurantId), eq(storeCredits.code, code))).limit(1);
  return row ?? null;
}

// Takes `amount` off each slip, refusing the whole set if any slip is short, expired or unknown.
// The decrement is conditional in SQL, so two tills spending the same slip can't both succeed.
export async function redeemStoreCredits(restaurantId: string, uses: { code: string; amount: number }[]): Promise<{ error?: string }> {
  const done: { code: string; amount: number }[] = [];
  for (const u of uses) {
    const amount = roundMoney(u.amount);
    const [row] = await db
      .update(storeCredits)
      .set({ balance: sql`round(${storeCredits.balance} - ${amount}, 2)` })
      .where(
        and(
          eq(storeCredits.restaurantId, restaurantId),
          eq(storeCredits.code, u.code),
          gte(storeCredits.balance, amount - 1e-9),
          or(isNull(storeCredits.expiresAt), gte(storeCredits.expiresAt, Date.now()))
        )
      )
      .returning({ code: storeCredits.code });
    if (!row) {
      await restoreStoreCredits(restaurantId, done);
      const found = await findStoreCredit(restaurantId, u.code);
      return { error: !found ? "That store credit isn't recognised." : found.expiresAt && found.expiresAt < Date.now() ? "That store credit has expired." : `That store credit only has ${found.balance.toFixed(2)} left.` };
    }
    done.push({ code: u.code, amount });
  }
  return {};
}

export async function restoreStoreCredits(restaurantId: string, uses: { code: string; amount: number }[]) {
  for (const u of uses) {
    await db
      .update(storeCredits)
      .set({ balance: sql`min(${storeCredits.original}, round(${storeCredits.balance} + ${roundMoney(u.amount)}, 2))` })
      .where(and(eq(storeCredits.restaurantId, restaurantId), eq(storeCredits.code, u.code)));
  }
}
