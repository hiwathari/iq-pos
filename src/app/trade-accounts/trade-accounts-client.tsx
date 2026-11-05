"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, Pause, Pencil, Play, Plus, X } from "lucide-react";
import { saveTradeAccountAction, setTradeHoldAction } from "@/lib/actions/trade-accounts";
import { formatMoney } from "@/lib/types";
import type { tradeAccounts } from "@/db/schema";

type Account = typeof tradeAccounts.$inferSelect;

// Trade accounts (docs/retail-plan step 6.6).
export function TradeAccountsClient({ accounts, currencySymbol }: { accounts: Account[]; currencySymbol: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const owed = accounts.reduce((s, a) => s + Math.max(0, a.balance), 0);

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Trade Accounts</h1>
          <p className="text-sm text-neutral-400">Business customers: trade prices, sales on account up to a credit limit, statements and what&apos;s overdue.</p>
        </div>
        <button onClick={() => setEditing("new")} className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
          <Plus className="h-4 w-4" /> New Account
        </button>
      </div>
      <div className="mb-4 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-500">
        Owed to you across all accounts: <span className="text-lg font-semibold text-neutral-900">{formatMoney(owed, currencySymbol)}</span>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-5 py-3">Company</th>
              <th className="px-4 py-3">Tier</th>
              <th className="px-4 py-3">Terms</th>
              <th className="px-4 py-3 text-right">Credit limit</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {accounts.map((a) => {
              const over = a.creditLimit != null && a.balance > a.creditLimit;
              return (
                <tr key={a.id} className={a.onHold ? "bg-rose-50/40" : undefined}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-light)] text-[var(--brand-dark)]">
                        <Building2 className="h-4 w-4" />
                      </span>
                      <div>
                        <Link href={`/trade-accounts/${a.id}`} className="font-semibold text-[var(--brand-dark)] hover:underline">
                          {a.companyName}
                        </Link>
                        <div className="text-xs text-neutral-400">{[a.contactName, a.phone].filter(Boolean).join(" · ")}{a.onHold ? " · ON HOLD" : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{a.priceTier ?? "—"}</td>
                  <td className="px-4 py-3 text-neutral-500">{a.paymentTermsDays != null ? `${a.paymentTermsDays} days` : "—"}</td>
                  <td className="px-4 py-3 text-right text-neutral-500">{a.creditLimit != null ? formatMoney(a.creditLimit, currencySymbol) : "No limit"}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${over ? "text-rose-600" : "text-neutral-800"}`}>{formatMoney(a.balance, currencySymbol)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => startTransition(async () => { await setTradeHoldAction(a.id, !a.onHold); router.refresh(); })} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100" title={a.onHold ? "Take off hold" : "Put on hold"} aria-label={`${a.onHold ? "Release" : "Hold"} ${a.companyName}`}>
                        {a.onHold ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </button>
                      <button onClick={() => setEditing(a)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-[var(--brand-dark)]" aria-label={`Edit ${a.companyName}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-neutral-400">
                  No trade accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && <AccountModal initial={editing === "new" ? null : editing} currencySymbol={currencySymbol} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
    </div>
  );
}

function AccountModal({ initial, currencySymbol, onClose, onSaved }: { initial: Account | null; currencySymbol: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    companyName: initial?.companyName ?? "",
    contactName: initial?.contactName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    billingAddress: initial?.billingAddress ?? "",
    deliveryAddress: initial?.deliveryAddress ?? "",
    vatNumber: initial?.vatNumber ?? "",
    creditLimit: initial?.creditLimit != null ? String(initial.creditLimit) : "",
    paymentTermsDays: initial?.paymentTermsDays != null ? String(initial.paymentTermsDays) : "",
    priceTier: initial?.priceTier ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const input = "w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500";
  const label = "mb-1 block text-xs font-medium text-neutral-500";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Trade account">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{initial ? "Edit Trade Account" : "New Trade Account"}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label}>Company name</label>
            <input autoFocus value={f.companyName} onChange={set("companyName")} className={input} aria-label="Company name" />
          </div>
          <div>
            <label className={label}>Contact</label>
            <input value={f.contactName} onChange={set("contactName")} className={input} />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input value={f.phone} onChange={set("phone")} className={input} />
          </div>
          <div className="col-span-2">
            <label className={label}>Email</label>
            <input type="email" value={f.email} onChange={set("email")} className={input} />
          </div>
          <div>
            <label className={label}>Credit limit ({currencySymbol}, blank = none)</label>
            <input type="number" min="0" step="0.01" value={f.creditLimit} onChange={set("creditLimit")} className={input} aria-label="Credit limit" />
          </div>
          <div>
            <label className={label}>Payment terms (days)</label>
            <input type="number" min="0" value={f.paymentTermsDays} onChange={set("paymentTermsDays")} className={input} aria-label="Payment terms" />
          </div>
          <div>
            <label className={label}>Price tier (e.g. trade)</label>
            <input value={f.priceTier} onChange={set("priceTier")} placeholder="trade" className={input} aria-label="Price tier" />
          </div>
          <div>
            <label className={label}>VAT number</label>
            <input value={f.vatNumber} onChange={set("vatNumber")} className={input} />
          </div>
          <div className="col-span-2">
            <label className={label}>Billing address</label>
            <textarea value={f.billingAddress} onChange={set("billingAddress")} rows={2} className={input} />
          </div>
          <div className="col-span-2">
            <label className={label}>Delivery address</label>
            <textarea value={f.deliveryAddress} onChange={set("deliveryAddress")} rows={2} className={input} />
          </div>
        </div>
        {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
        <button
          disabled={pending}
          onClick={() => startTransition(async () => {
            const r = await saveTradeAccountAction(initial?.id ?? null, { ...f, creditLimit: f.creditLimit === "" ? null : Number(f.creditLimit), paymentTermsDays: f.paymentTermsDays === "" ? null : Number(f.paymentTermsDays) });
            if (r.error) return setError(r.error);
            onSaved();
          })}
          className="mt-4 w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
        >
          {initial ? "Save Changes" : "Add Account"}
        </button>
      </div>
    </div>
  );
}
