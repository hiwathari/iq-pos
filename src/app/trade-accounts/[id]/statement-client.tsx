"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { recordTradePaymentAction } from "@/lib/actions/trade-accounts";
import type { AgedBuckets, StatementLine } from "@/lib/data/trade-accounts";
import { formatMoney } from "@/lib/types";

// A trade account's statement (docs/retail-plan step 6.6): invoices and payments with a running
// balance, what's overdue, and recording a payment received.
export function StatementClient({
  account,
  lines,
  aged,
  business,
  currencySymbol,
}: {
  account: { id: string; companyName: string; billingAddress: string | null; vatNumber: string | null; creditLimit: number | null; paymentTermsDays: number | null; balance: number; onHold: boolean };
  lines: StatementLine[];
  aged: AgedBuckets;
  business: { name: string; address: string | null };
  currencySymbol: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Bank transfer");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);
  const m = (n: number) => formatMoney(n, currencySymbol);
  const input = "rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500";
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="print:hidden">
        <Link href="/trade-accounts" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> Trade Accounts
        </Link>
      </div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{account.companyName}</h1>
          <p className="text-sm text-neutral-400">
            Statement · {business.name}
            {account.vatNumber ? ` · VAT ${account.vatNumber}` : ""}
            {account.paymentTermsDays != null ? ` · ${account.paymentTermsDays}-day terms` : ""}
          </p>
          {account.billingAddress && <p className="whitespace-pre-line text-sm text-neutral-500">{account.billingAddress}</p>}
        </div>
        <button onClick={() => window.print()} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 print:hidden">
          <Printer className="h-4 w-4" /> Print
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Balance", account.balance, account.creditLimit != null && account.balance > account.creditLimit ? "text-rose-600" : "text-neutral-900"],
          ["Not yet due", aged.current, "text-neutral-700"],
          ["1–30 days late", aged.d1_30, aged.d1_30 > 0 ? "text-amber-600" : "text-neutral-700"],
          ["31–60 days late", aged.d31_60, aged.d31_60 > 0 ? "text-amber-700" : "text-neutral-700"],
          ["Over 60 days", aged.d60plus, aged.d60plus > 0 ? "text-rose-600" : "text-neutral-700"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="rounded-2xl border border-neutral-200 bg-white px-3 py-2.5">
            <div className="text-xs font-medium text-neutral-400">{label as string}</div>
            <div className={`text-lg font-semibold ${tone as string}`}>{m(value as number)}</div>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-2 rounded-2xl border border-neutral-200 bg-white p-3 print:hidden">
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Payment received ({currencySymbol})</label>
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" aria-label="Payment amount" className={`${input} w-32`} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">How</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
            {["Bank transfer", "Cheque", "Cash", "Card"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Reference</label>
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={input} aria-label="Payment reference" />
        </div>
        <button
          disabled={pending || !amount}
          onClick={() => startTransition(async () => {
            const r = await recordTradePaymentAction(account.id, { amount: Number(amount), method, reference });
            if (r.error) return setError(r.error);
            setAmount("");
            setReference("");
            setError(null);
            router.refresh();
          })}
          className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
        >
          Record payment
        </button>
        {error && <p className="w-full text-xs font-medium text-rose-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Entry</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-right">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-4 py-2.5 text-neutral-500">{new Date(l.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                <td className="px-4 py-2.5 text-neutral-800">
                  {l.orderId ? (
                    <Link href={`/invoice/${l.orderId}`} className="font-medium text-[var(--brand-dark)] hover:underline">
                      {l.ref}
                    </Link>
                  ) : (
                    l.ref
                  )}
                  {l.note && <span className="ml-1 text-xs text-neutral-400">{l.note}</span>}
                </td>
                <td className={`px-4 py-2.5 text-right font-medium ${l.amount < 0 ? "text-emerald-600" : "text-neutral-800"}`}>{l.amount < 0 ? `−${m(-l.amount)}` : m(l.amount)}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-neutral-800">{m(l.balance)}</td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Nothing on this account yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
