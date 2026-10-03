"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { terminalExpenses, terminalPayouts } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function addTerminalPayoutAction(paymentTerminalId: string, date: string, amount: number, note: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "reports");
  const clamped = Math.round(Math.abs(amount) * 100) / 100;
  if (!DATE_PATTERN.test(date) || clamped <= 0) return { error: "Pick a date and enter an amount greater than 0." };

  await db.insert(terminalPayouts).values({
    restaurantId,
    paymentTerminalId,
    date,
    amount: clamped,
    note: note.trim().slice(0, 200) || null,
    createdByName: session.name,
  });
  revalidatePath("/reports");
  return {};
}

export async function deleteTerminalPayoutAction(payoutId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "reports");
  await db
    .delete(terminalPayouts)
    .where(and(eq(terminalPayouts.id, payoutId), eq(terminalPayouts.restaurantId, restaurantId)));
  revalidatePath("/reports");
}

export async function addTerminalExpenseAction(
  paymentTerminalId: string,
  date: string,
  amount: number,
  description: string
) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "reports");
  const trimmed = description.trim().slice(0, 200);
  const clamped = Math.round(Math.abs(amount) * 100) / 100;
  if (!DATE_PATTERN.test(date) || !trimmed || clamped <= 0) {
    return { error: "Pick a date, enter a description, and an amount greater than 0." };
  }

  await db.insert(terminalExpenses).values({
    restaurantId,
    paymentTerminalId,
    date,
    amount: clamped,
    description: trimmed,
    createdByName: session.name,
  });
  revalidatePath("/reports");
  return {};
}

export async function deleteTerminalExpenseAction(expenseId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "reports");
  await db
    .delete(terminalExpenses)
    .where(and(eq(terminalExpenses.id, expenseId), eq(terminalExpenses.restaurantId, restaurantId)));
  revalidatePath("/reports");
}
