import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, tradeAccounts, tradePayments } from "@/db/schema";
import { orderTotal, type Order } from "@/lib/types";

// Trade accounts (docs/retail-plan step 6.6): business customers who buy on account.
export async function listTradeAccounts(restaurantId: string) {
  return db.select().from(tradeAccounts).where(eq(tradeAccounts.restaurantId, restaurantId)).orderBy(asc(tradeAccounts.companyName));
}

export async function getTradeAccount(restaurantId: string, id: string) {
  const [row] = await db.select().from(tradeAccounts).where(and(eq(tradeAccounts.restaurantId, restaurantId), eq(tradeAccounts.id, id))).limit(1);
  return row ?? null;
}

export const onAccountAmount = (o: Pick<Order, "payments" | "paymentMethod" | "items" | "extraDiscount" | "couponDiscount">) => {
  if (o.payments?.length) return o.payments.filter((p) => p.method === "On account").reduce((s, p) => s + p.amount, 0);
  return o.paymentMethod === "On account" ? orderTotal(o) : 0;
};

export interface StatementLine {
  at: number;
  kind: "invoice" | "payment";
  ref: string;
  orderId?: string;
  note?: string;
  amount: number; // + owed, − paid
  balance: number;
}

// Opening balance is always 0 (the account starts with the first sale); every sale on account is
// an invoice, every payment received a credit. Voided sales aren't listed.
export async function tradeStatement(restaurantId: string, accountId: string) {
  const [sales, payments] = await Promise.all([
    db.select().from(orders).where(and(eq(orders.restaurantId, restaurantId), eq(orders.tradeAccountId, accountId))).orderBy(asc(orders.createdAt)),
    db.select().from(tradePayments).where(and(eq(tradePayments.restaurantId, restaurantId), eq(tradePayments.tradeAccountId, accountId))).orderBy(asc(tradePayments.createdAt)),
  ]);
  const entries: Omit<StatementLine, "balance">[] = [];
  for (const o of sales) {
    if (o.status === "Voided") continue;
    const amount = onAccountAmount(o);
    if (amount > 0.004) entries.push({ at: o.createdAt, kind: "invoice", ref: `Invoice ${o.orderNumber}`, orderId: o.id, amount });
  }
  for (const p of payments) entries.push({ at: p.createdAt, kind: "payment", ref: `Payment — ${p.method}`, note: p.reference ?? undefined, amount: -p.amount });
  entries.sort((a, b) => a.at - b.at);
  let balance = 0;
  const lines: StatementLine[] = entries.map((e) => {
    balance = Math.round((balance + e.amount) * 100) / 100;
    return { ...e, balance };
  });
  return { lines, balance };
}

export interface AgedBuckets {
  current: number; // not yet due
  d1_30: number;
  d31_60: number;
  d60plus: number;
}

// Payments are matched to the oldest invoices first; what's left of each invoice ages from its
// due date (invoice date + payment terms).
export function agedDebt(lines: StatementLine[], termsDays: number, now: number): AgedBuckets {
  let paid = lines.filter((l) => l.kind === "payment").reduce((s, l) => s - l.amount, 0);
  const out: AgedBuckets = { current: 0, d1_30: 0, d31_60: 0, d60plus: 0 };
  for (const inv of lines.filter((l) => l.kind === "invoice")) {
    const settled = Math.min(inv.amount, paid);
    paid -= settled;
    const left = Math.round((inv.amount - settled) * 100) / 100;
    if (left <= 0.004) continue;
    const overdue = Math.floor((now - (inv.at + termsDays * 86400000)) / 86400000);
    if (overdue <= 0) out.current += left;
    else if (overdue <= 30) out.d1_30 += left;
    else if (overdue <= 60) out.d31_60 += left;
    else out.d60plus += left;
  }
  return out;
}

export async function listTradePayments(restaurantId: string, accountId: string) {
  return db.select().from(tradePayments).where(and(eq(tradePayments.restaurantId, restaurantId), eq(tradePayments.tradeAccountId, accountId))).orderBy(desc(tradePayments.createdAt));
}
