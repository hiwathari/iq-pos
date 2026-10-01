"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { restaurants, shifts } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import { findShiftIssues, listShifts, resolveShiftWindowStart, summarizeShiftWindow, type ShiftIssue } from "@/lib/data/shifts";
import { getReportData } from "@/lib/data/reports";
import { createNotification } from "@/lib/data/notifications";
import { formatMoney } from "@/lib/types";

export interface OpenTillState {
  error?: string;
}

// Declares the starting cash float for the day/shift that's about to begin — any staff member
// with the end-day permission can do this, not just admins (it's the opening half of the same
// till-reconciliation workflow as End Day Closing). Stored on the restaurant itself rather than
// a dedicated session table since a restaurant only ever runs one till period at a time; consumed
// and cleared by endShiftAction so the next day has to declare its own.
export async function openTillAction(openingBalance: number): Promise<OpenTillState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "end-day");

  if (!Number.isFinite(openingBalance) || openingBalance < 0) {
    return { error: "Enter a valid opening balance." };
  }

  await db
    .update(restaurants)
    .set({
      pendingOpeningBalance: openingBalance,
      openingBalanceSetByName: session.name,
      openingBalanceSetAt: Date.now(),
    })
    .where(eq(restaurants.id, restaurantId));

  revalidatePath("/dashboard");
  return {};
}

export interface EndShiftState {
  error?: string;
  shiftId?: string;
}

export interface EndShiftInput {
  cashCounted: number;
  // What the manager counted/settled for each named payment method (Cash + every payment
  // terminal) — compared line-by-line on the report against this window's actual sales per
  // method, so a restaurant running several card machines gets each one reconciled separately.
  terminalCounts: { method: string; counted: number }[];
  cashExpenses: number;
  cardExpenses: number;
  notes: string;
}

// Closes out the open-ended period since the last shift (or since the restaurant's very first
// order, for the first shift ever) and freezes its sales/cash numbers into a new shift row —
// the day-end reconciliation, exported as a printable report right after. Available to any
// staff member with the end-day permission, not just admins — see lib/permissions.ts.
export async function endShiftAction(input: EndShiftInput): Promise<EndShiftState> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "end-day");

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
  const openingBalance = restaurant?.pendingOpeningBalance ?? 0;

  const sinceTs = await resolveShiftWindowStart(restaurantId, restaurant?.createdAt ?? Date.now());
  const uptoTs = Date.now();
  const summary = await summarizeShiftWindow(restaurantId, sinceTs, uptoTs);

  const cashExpenses = Math.max(0, input.cashExpenses || 0);
  const cardExpenses = Math.max(0, input.cardExpenses || 0);

  const [shift] = await db
    .insert(shifts)
    .values({
      restaurantId,
      openedAt: sinceTs,
      closedAt: uptoTs,
      closedByUserId: session.userId,
      closedByName: session.name,
      notes: input.notes.trim() || null,
      cashCounted: input.cashCounted,
      openingBalance,
      cashExpenses,
      cardExpenses,
      terminalCounts: input.terminalCounts,
      ...summary,
      // Expected cash starts from the declared float, adds cash sales, and subtracts whatever
      // cash left the till as an expense during the shift.
      expectedCash: openingBalance + summary.expectedCash - cashExpenses,
    })
    .returning();

  // The float that was just reconciled no longer applies — the next day/shift has to declare
  // its own before it closes.
  await db
    .update(restaurants)
    .set({ pendingOpeningBalance: null, openingBalanceSetByName: null, openingBalanceSetAt: null })
    .where(eq(restaurants.id, restaurantId));

  await notifyIfShiftDidNotBalance(shift, restaurant?.currencySymbol ?? "£", session.name);

  return { shiftId: shift.id };
}

// Flags it to the admin the moment a day's close doesn't tally — cash short/over, or any named
// payment terminal's counted total not matching what the system expected — rather than relying
// on someone opening every shift report by hand to notice. One notification per discrepant
// close, listing every mismatched line so a multi-terminal restaurant sees all of them at once.
async function notifyIfShiftDidNotBalance(shift: typeof shifts.$inferSelect, currencySymbol: string, closedByName: string) {
  const lines: string[] = [];

  const cashVariance = shift.cashCounted - shift.expectedCash;
  if (Math.abs(cashVariance) >= 0.01) {
    lines.push(`Cash ${cashVariance > 0 ? "over" : "short"} by ${formatMoney(Math.abs(cashVariance), currencySymbol)}`);
  }

  for (const method of new Set([...(shift.terminalSales ?? []).map((t) => t.method), ...(shift.terminalCounts ?? []).map((c) => c.method)])) {
    const expected = shift.terminalSales?.find((t) => t.method === method)?.amount ?? 0;
    const counted = shift.terminalCounts?.find((c) => c.method === method)?.counted ?? 0;
    const variance = counted - expected;
    if (Math.abs(variance) >= 0.01) {
      lines.push(`${method} ${variance > 0 ? "over" : "short"} by ${formatMoney(Math.abs(variance), currencySymbol)}`);
    }
  }

  if (lines.length === 0) return;

  await createNotification(shift.restaurantId, {
    title: "Day close didn't balance",
    body: `${closedByName}'s close: ${lines.join("; ")}.`,
    link: `/shift-report/${shift.id}`,
  });
}

export interface ShiftPreview {
  openingBalance: number;
  sinceTs: number;
  totalSales: number;
  cashSales: number;
  cardSales: number;
  otherSales: number;
  orderCount: number;
  voidCount: number;
  voidAmount: number;
  expectedCash: number;
  terminalSales: { method: string; amount: number }[];
  itemSales: { name: string; qty: number; total: number }[];
  issues: ShiftIssue[];
  recentShifts: { id: string; closedAt: number; totalSales: number; variance: number }[];
}

// A read-only look at "if I closed the day right now" — the same numbers endShiftAction would
// freeze into a shift row, computed live with nothing written. Lets staff see the running
// totals, the item-wise breakdown, and anything that needs resolving (findShiftIssues) before
// they commit to actually ending the day.
export async function previewShiftSummaryAction(): Promise<ShiftPreview> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "end-day");

  const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId));
  const openingBalance = restaurant?.pendingOpeningBalance ?? 0;

  const sinceTs = await resolveShiftWindowStart(restaurantId, restaurant?.createdAt ?? Date.now());
  const uptoTs = Date.now();

  const [summary, report, issues, pastShifts] = await Promise.all([
    summarizeShiftWindow(restaurantId, sinceTs, uptoTs),
    getReportData(restaurantId, { from: sinceTs, to: uptoTs + 1 }),
    findShiftIssues(restaurantId, sinceTs, uptoTs),
    listShifts(restaurantId),
  ]);

  const revenueByName = new Map(report.itemWiseRevenue.map((r) => [r.name, r.revenue]));
  const itemSales = report.itemWiseSoldQty.map((i) => ({ name: i.name, qty: i.qty, total: revenueByName.get(i.name) ?? 0 }));

  return {
    openingBalance,
    sinceTs,
    ...summary,
    itemSales,
    issues,
    recentShifts: pastShifts.slice(0, 3).map((s) => ({ id: s.id, closedAt: s.closedAt, totalSales: s.totalSales, variance: s.cashCounted - s.expectedCash })),
  };
}
