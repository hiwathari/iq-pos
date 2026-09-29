"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InventoryItem } from "@/lib/types";
import {
  adjustInventoryStockAction,
  createInventoryItemAction,
  deleteInventoryItemAction,
  updateInventoryItemAction,
  type InventoryItemInput,
} from "@/lib/actions/inventory";
import { AlertTriangle, Minus, Package, Pencil, Plus, Trash2, X } from "lucide-react";

export function InventoryClient({ items }: { items: InventoryItem[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adjustFor, setAdjustFor] = useState<InventoryItem | null>(null);

  function openAdd() {
    setEditingItem(null);
    setModalOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditingItem(item);
    setModalOpen(true);
  }

  function handleSave(input: InventoryItemInput) {
    startTransition(async () => {
      if (editingItem) await updateInventoryItemAction(editingItem.id, input);
      else await createInventoryItemAction(input);
      router.refresh();
    });
    setModalOpen(false);
    setEditingItem(null);
  }

  function handleDelete(item: InventoryItem) {
    if (!confirm(`Delete "${item.name}" from inventory?`)) return;
    startTransition(async () => {
      await deleteInventoryItemAction(item.id);
      router.refresh();
    });
  }

  const lowStockCount = items.filter((i) => i.quantity <= i.lowStockThreshold).length;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Inventory</h1>
          <p className="text-sm text-neutral-400">
            Track stock levels and link a dish to an item so selling it decrements stock automatically.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          <Plus className="h-4 w-4" /> New Item
        </button>
      </div>

      {lowStockCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {lowStockCount} item{lowStockCount === 1 ? " is" : "s are"} at or below its low-stock threshold.
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-5 py-3">Item</th>
              <th className="px-5 py-3">Quantity</th>
              <th className="px-5 py-3">Low Stock At</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((item) => {
              const low = item.quantity <= item.lowStockThreshold;
              return (
                <tr key={item.id} className={low ? "bg-amber-50/40" : undefined}>
                  <td className="flex items-center gap-3 px-5 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-light)] text-[var(--brand-dark)]">
                      <Package className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-neutral-800">{item.name}</span>
                    {low && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setAdjustFor(item)}
                        className="rounded-lg border border-neutral-200 p-1 text-neutral-400 hover:bg-neutral-50"
                        title="Adjust stock"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className={`font-semibold ${low ? "text-amber-700" : "text-neutral-800"}`}>
                        {item.quantity} {item.unit}
                      </span>
                      <button
                        onClick={() => setAdjustFor(item)}
                        className="rounded-lg border border-neutral-200 p-1 text-neutral-400 hover:bg-neutral-50"
                        title="Adjust stock"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-neutral-500">
                    {item.lowStockThreshold} {item.unit}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(item)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-[var(--brand-dark)]">
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(item)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-neutral-400">
                  No inventory items yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <ItemModal
          initial={editingItem}
          onClose={() => {
            setModalOpen(false);
            setEditingItem(null);
          }}
          onSave={handleSave}
        />
      )}
      {adjustFor && <AdjustModal item={adjustFor} onClose={() => setAdjustFor(null)} onDone={() => router.refresh()} />}
    </div>
  );
}

function ItemModal({
  initial,
  onClose,
  onSave,
}: {
  initial: InventoryItem | null;
  onClose: () => void;
  onSave: (input: InventoryItemInput) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "pcs");
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : "0");
  const [lowStockThreshold, setLowStockThreshold] = useState(initial ? String(initial.lowStockThreshold) : "0");
  const [error, setError] = useState<string | null>(null);
  const canSave = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{initial ? "Edit Item" : "New Inventory Item"}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-neutral-500">Item Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Chicken Breast"
          className="mb-4 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
        />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Unit</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="kg, L, pcs…"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
            />
          </div>
          {!initial && (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Starting Quantity</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
              />
            </div>
          )}
        </div>

        <label className="mb-1 block text-xs font-medium text-neutral-500">Low Stock Threshold</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={lowStockThreshold}
          onChange={(e) => setLowStockThreshold(e.target.value)}
          className="mb-4 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
        />
        <p className="mb-4 text-xs text-neutral-400">Flagged as low stock once quantity drops to this level or below.</p>

        {error && <p className="mb-4 text-xs font-medium text-rose-600">{error}</p>}

        <button
          disabled={!canSave}
          onClick={() => {
            const q = Number(quantity);
            const t = Number(lowStockThreshold);
            if (!name.trim()) return setError("Enter an item name.");
            onSave({ name: name.trim(), unit, quantity: q, lowStockThreshold: t });
          }}
          className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
        >
          {initial ? "Save Changes" : "Create Item"}
        </button>
      </div>
    </div>
  );
}

function AdjustModal({ item, onClose, onDone }: { item: InventoryItem; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(sign: 1 | -1) {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    startTransition(async () => {
      await adjustInventoryStockAction(item.id, value * sign);
      onDone();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Adjust Stock</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-neutral-500">
          Currently <span className="font-semibold text-neutral-800">{item.quantity} {item.unit}</span>
        </p>
        <input
          type="number"
          min="0"
          step="0.01"
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Amount (${item.unit})`}
          className="mb-3 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
        />
        {error && <p className="mb-3 text-xs font-medium text-rose-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button
            disabled={pending}
            onClick={() => apply(-1)}
            className="rounded-xl border border-rose-200 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            Remove
          </button>
          <button
            disabled={pending}
            onClick={() => apply(1)}
            className="rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
