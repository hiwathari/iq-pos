"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createPaymentTerminalAction,
  deletePaymentTerminalAction,
  togglePaymentTerminalActiveAction,
  updatePaymentTerminalAction,
} from "@/lib/actions/printers";
import type { PaymentTerminal } from "@/lib/types";

export function PaymentTerminalsClient({ terminals }: { terminals: PaymentTerminal[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTerminal, setEditingTerminal] = useState<PaymentTerminal | null>(null);

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      await togglePaymentTerminalActiveAction(id, active);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deletePaymentTerminalAction(id);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Payment Terminals</h2>
          <p className="text-sm text-neutral-500">
            Register each card machine by name (e.g. Card 1, Yellow Card) — add a logo so staff can tell them apart
            at a glance on the Till.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          <Plus className="h-4 w-4" /> Add Terminal
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {terminals.map((t) => (
          <div key={t.id} className="flex items-start justify-between rounded-2xl border border-neutral-200 bg-white p-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                {t.logoUrl ? (
                  <img src={t.logoUrl} alt="" className="h-6 w-6 rounded object-contain" />
                ) : (
                  <CreditCard className="h-4 w-4 text-neutral-400" />
                )}
                <span className="font-semibold text-neutral-900">{t.name}</span>
              </div>
              <span
                className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                  t.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {t.active ? "Active" : "Disabled"}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => setEditingTerminal(t)}
                className="flex items-center justify-center rounded-lg border border-neutral-200 px-2.5 py-1 text-neutral-500 hover:bg-neutral-50"
                title="Edit name / logo"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => toggle(t.id, !t.active)}
                className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
              >
                {t.active ? "Disable" : "Enable"}
              </button>
              <button
                onClick={() => remove(t.id)}
                className="flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-600 hover:bg-rose-100"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {terminals.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-400">
            No payment terminals registered yet.
          </div>
        )}
      </div>

      {modalOpen && <TerminalModal onClose={() => setModalOpen(false)} />}
      {editingTerminal && <TerminalModal terminal={editingTerminal} onClose={() => setEditingTerminal(null)} />}
    </div>
  );
}

function TerminalModal({ terminal, onClose }: { terminal?: PaymentTerminal; onClose: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(terminal?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(terminal?.logoUrl ?? "");

  function save() {
    if (!name.trim()) return;
    startTransition(async () => {
      if (terminal) await updatePaymentTerminalAction(terminal.id, name, logoUrl);
      else await createPaymentTerminalAction(name, logoUrl);
      router.refresh();
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{terminal ? "Edit" : "Add"} Payment Terminal</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Yellow Card"
              autoFocus
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Logo URL (optional)</label>
            <div className="flex items-center gap-2.5">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                  <CreditCard className="h-4 w-4 text-neutral-400" />
                </div>
              )}
              <input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://…"
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {terminal ? "Save Changes" : "Add Terminal"}
          </button>
        </div>
      </div>
    </div>
  );
}
