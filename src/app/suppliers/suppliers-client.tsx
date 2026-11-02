"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Phone, Plus, Trash2, Truck, X } from "lucide-react";
import { deleteSupplierAction, saveSupplierAction, type SupplierInput } from "@/lib/actions/suppliers";
import type { Supplier } from "@/lib/types";
import { formatMoney } from "@/lib/types";

type Row = Supplier & { itemCount: number; openOrders: number };

export function SuppliersClient({ suppliers, currencySymbol }: { suppliers: Row[]; currencySymbol: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function remove(s: Row) {
    if (!confirm(`Delete ${s.name}? Items from them are kept, just with no supplier.`)) return;
    startTransition(async () => {
      const res = await deleteSupplierAction(s.id);
      setNotice(res.error ?? null);
      router.refresh();
    });
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Suppliers</h1>
          <p className="text-sm text-neutral-400">Who you buy from. Give an item a supplier and Reorder groups your shopping list by them.</p>
        </div>
        <button onClick={() => setEditing("new")} className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
          <Plus className="h-4 w-4" /> New Supplier
        </button>
      </div>
      {notice && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">{notice}</p>}

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-5 py-3">Supplier</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Lead time</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Open orders</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-light)] text-[var(--brand-dark)]">
                      <Truck className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="font-medium text-neutral-800">{s.name}</div>
                      {s.accountRef && <div className="text-xs text-neutral-400">Account {s.accountRef}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {s.contactName && <div>{s.contactName}</div>}
                  {s.email && (
                    <div className="flex items-center gap-1 text-xs">
                      <Mail className="h-3 w-3" /> {s.email}
                    </div>
                  )}
                  {s.phone && (
                    <div className="flex items-center gap-1 text-xs">
                      <Phone className="h-3 w-3" /> {s.phone}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {s.leadTimeDays != null ? `${s.leadTimeDays} day${s.leadTimeDays === 1 ? "" : "s"}` : "—"}
                  {s.minOrder != null && <div className="text-xs text-neutral-400">min {formatMoney(s.minOrder, currencySymbol)}</div>}
                </td>
                <td className="px-4 py-3 text-neutral-700">{s.itemCount}</td>
                <td className="px-4 py-3 text-neutral-700">{s.openOrders}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/purchase-orders/new?supplier=${s.id}`} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--brand-dark)] hover:bg-[var(--brand-light)]">
                      New order
                    </Link>
                    <button onClick={() => setEditing(s)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-[var(--brand-dark)]" aria-label={`Edit ${s.name}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(s)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${s.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-neutral-400">
                  No suppliers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <SupplierModal
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function SupplierModal({ initial, onClose, onSaved }: { initial: Row | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: initial?.name ?? "",
    contactName: initial?.contactName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    accountRef: initial?.accountRef ?? "",
    leadTimeDays: initial?.leadTimeDays != null ? String(initial.leadTimeDays) : "",
    minOrder: initial?.minOrder != null ? String(initial.minOrder) : "",
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((cur) => ({ ...cur, [k]: e.target.value }));
  const input = "w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500";
  const label = "mb-1 block text-xs font-medium text-neutral-500";

  function save() {
    const payload: SupplierInput = {
      ...f,
      leadTimeDays: f.leadTimeDays === "" ? null : Number(f.leadTimeDays),
      minOrder: f.minOrder === "" ? null : Number(f.minOrder),
    };
    startTransition(async () => {
      const res = await saveSupplierAction(initial?.id ?? null, payload);
      if (res.error) return setError(res.error);
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Supplier">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{initial ? "Edit Supplier" : "New Supplier"}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={label}>Name</label>
            <input autoFocus value={f.name} onChange={set("name")} className={input} placeholder="e.g. Fresh Fields Wholesale" />
          </div>
          <div>
            <label className={label}>Contact</label>
            <input value={f.contactName} onChange={set("contactName")} className={input} />
          </div>
          <div>
            <label className={label}>Account number</label>
            <input value={f.accountRef} onChange={set("accountRef")} className={input} />
          </div>
          <div>
            <label className={label}>Email (orders are sent here)</label>
            <input type="email" value={f.email} onChange={set("email")} className={input} />
          </div>
          <div>
            <label className={label}>Phone</label>
            <input value={f.phone} onChange={set("phone")} className={input} />
          </div>
          <div>
            <label className={label}>Delivery takes (days)</label>
            <input type="number" min="0" value={f.leadTimeDays} onChange={set("leadTimeDays")} className={input} />
          </div>
          <div>
            <label className={label}>Minimum order</label>
            <input type="number" min="0" step="0.01" value={f.minOrder} onChange={set("minOrder")} className={input} />
          </div>
          <div className="col-span-2">
            <label className={label}>Address</label>
            <input value={f.address} onChange={set("address")} className={input} />
          </div>
          <div className="col-span-2">
            <label className={label}>Notes</label>
            <textarea value={f.notes} onChange={set("notes")} rows={2} className={input} />
          </div>
        </div>
        {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
        <button disabled={pending} onClick={save} className="mt-4 w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
          {initial ? "Save Changes" : "Add Supplier"}
        </button>
      </div>
    </div>
  );
}
