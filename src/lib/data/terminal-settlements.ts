import { and, eq, gte, lt, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, paymentTerminals, shifts, terminalExpenses, terminalPayouts } from "@/db/schema";
import { orderTotal } from "@/lib/types";

// Mirrors accounts-filter.ts's 14-day trailing window for every card terminal except the
// restaurant's designated default one, applied here to manually-entered payout/expense rows
// instead of orders — so the "accounts" role can't see a non-default terminal's commission
// history (which is just as revealing as its sales history) beyond what filterOrdersForAccountsRole
// already lets through for orders.
const RESTRICTED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function filterEntriesForAccountsRole<T extends { date: string }>(
  rows: T[],
  terminalId: string,
  defaultTerminalId: string | null,
  now = Date.now()
): T[] {
  if (terminalId === defaultTerminalId) return rows;
  const cutoff = new Date(now - RESTRICTED_WINDOW_MS).toISOString().slice(0, 10);
  return rows.filter((r) => r.date >= cutoff);
}

export async function listTerminalPayouts(
  restaurantId: string,
  paymentTerminalId: string,
  fromStr: string,
  toStr: string,
  accountsFilter?: { defaultTerminalId: string | null }
) {
  const rows = await db
    .select()
    .from(terminalPayouts)
    .where(
      and(
        eq(terminalPayouts.restaurantId, restaurantId),
        eq(terminalPayouts.paymentTerminalId, paymentTerminalId),
        gte(terminalPayouts.date, fromStr),
        lte(terminalPayouts.date, toStr)
      )
    );
  return accountsFilter
    ? filterEntriesForAccountsRole(rows, paymentTerminalId, accountsFilter.defaultTerminalId)
    : rows;
}

export async function listTerminalExpenses(
  restaurantId: string,
  paymentTerminalId: string,
  fromStr: string,
  toStr: string,
  accountsFilter?: { defaultTerminalId: string | null }
) {
  const rows = await db
    .select()
    .from(terminalExpenses)
    .where(
      and(
        eq(terminalExpenses.restaurantId, restaurantId),
        eq(terminalExpenses.paymentTerminalId, paymentTerminalId),
        gte(terminalExpenses.date, fromStr),
        lte(terminalExpenses.date, toStr)
      )
    );
  return accountsFilter
    ? filterEntriesForAccountsRole(rows, paymentTerminalId, accountsFilter.defaultTerminalId)
    : rows;
}

export type TerminalSettlementRow = {
  date: string;
  terminalId: string;
  terminalName: string;
  grossSales: number;
  shiftCounted: number | null;
  expense: number;
  payout: number;
  expectedNet: number;
  variance: number;
};

export type TerminalSettlementReport = Awaited<ReturnType<typeof getTerminalSettlementReport>>;

// One row per (day, terminal) that actually saw a card sale, a payout, or an expense entry in the
// range — built from four independent sources that should all agree but never share a primary
// key, so each is bucketed separately by its own date/terminal and merged at the end:
//   - grossSales: what the Till itself recorded, from orders' payment lines (ground truth for
//     "what was charged").
//   - shiftCounted: what staff counted into this terminal at End Day (shifts.terminalCounts) —
//     the shop's own point-of-sale reconciliation, independent of anything typed in here.
//   - expense/payout: what this report's own ledgers were told the card machine statement says.
// Comparing all four is the point — any of them disagreeing is exactly the discrepancy an admin
// needs this report to surface.
export async function getTerminalSettlementReport(
  restaurantId: string,
  range: { fromStr: string; toStr: string; from: number; to: number },
  accountsFilter?: { defaultTerminalId: string | null }
): Promise<{ rows: TerminalSettlementRow[]; terminals: { id: string; name: string }[] }> {
  const [terminals, rangeOrders, allShifts, payouts, expenses] = await Promise.all([
    db.select().from(paymentTerminals).where(eq(paymentTerminals.restaurantId, restaurantId)),
    db
      .select()
      .from(orders)
      .where(and(eq(orders.restaurantId, restaurantId), gte(orders.createdAt, range.from), lt(orders.createdAt, range.to))),
    db.select().from(shifts).where(eq(shifts.restaurantId, restaurantId)),
    db
      .select()
      .from(terminalPayouts)
      .where(
        and(
          eq(terminalPayouts.restaurantId, restaurantId),
          gte(terminalPayouts.date, range.fromStr),
          lte(terminalPayouts.date, range.toStr)
        )
      ),
    db
      .select()
      .from(terminalExpenses)
      .where(
        and(
          eq(terminalExpenses.restaurantId, restaurantId),
          gte(terminalExpenses.date, range.fromStr),
          lte(terminalExpenses.date, range.toStr)
        )
      ),
  ]);

  const terminalNameById = new Map(terminals.map((t) => [t.id, t.name]));
  const terminalIdByName = new Map(terminals.map((t) => [t.name, t.id]));

  type Bucket = { grossSales: number; shiftCounted: number | null; expense: number; payout: number };
  const buckets = new Map<string, Bucket>();
  const bucketKey = (date: string, terminalId: string) => `${date}::${terminalId}`;
  const bucketFor = (date: string, terminalId: string) => {
    const key = bucketKey(date, terminalId);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { grossSales: 0, shiftCounted: null, expense: 0, payout: 0 };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const o of rangeOrders) {
    if (o.status === "Voided") continue;
    const total = orderTotal(o);
    const methodLines = o.payments?.length ? o.payments : o.paymentMethod ? [{ method: o.paymentMethod, amount: total }] : [];
    const dateKey = new Date(o.createdAt).toISOString().slice(0, 10);
    for (const line of methodLines) {
      const terminalId = terminalIdByName.get(line.method);
      if (!terminalId) continue;
      bucketFor(dateKey, terminalId).grossSales += line.amount;
    }
  }

  for (const shift of allShifts) {
    const dateKey = new Date(shift.closedAt).toISOString().slice(0, 10);
    if (dateKey < range.fromStr || dateKey > range.toStr) continue;
    for (const count of shift.terminalCounts ?? []) {
      const terminalId = terminalIdByName.get(count.method);
      if (!terminalId) continue;
      const bucket = bucketFor(dateKey, terminalId);
      bucket.shiftCounted = (bucket.shiftCounted ?? 0) + count.counted;
    }
  }

  for (const p of payouts) {
    if (!terminalNameById.has(p.paymentTerminalId)) continue;
    bucketFor(p.date, p.paymentTerminalId).payout += p.amount;
  }
  for (const e of expenses) {
    if (!terminalNameById.has(e.paymentTerminalId)) continue;
    bucketFor(e.date, e.paymentTerminalId).expense += e.amount;
  }

  let rows: TerminalSettlementRow[] = [...buckets.entries()]
    .map(([key, b]) => {
      const [date, terminalId] = key.split("::");
      const expectedNet = b.grossSales - b.expense;
      return {
        date,
        terminalId,
        terminalName: terminalNameById.get(terminalId) ?? "Unknown",
        grossSales: b.grossSales,
        shiftCounted: b.shiftCounted,
        expense: b.expense,
        payout: b.payout,
        expectedNet,
        variance: b.payout - expectedNet,
      };
    })
    .sort((a, b) => (a.date === b.date ? a.terminalName.localeCompare(b.terminalName) : a.date.localeCompare(b.date)));

  if (accountsFilter) {
    const cutoff = new Date(Date.now() - RESTRICTED_WINDOW_MS).toISOString().slice(0, 10);
    rows = rows.filter((r) => r.terminalId === accountsFilter.defaultTerminalId || r.date >= cutoff);
  }

  return { rows, terminals: terminals.map((t) => ({ id: t.id, name: t.name })) };
}
