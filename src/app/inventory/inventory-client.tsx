"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { StockRow } from "@/lib/data/stock";
import {
  adjustInventoryStockAction,
  createInventoryItemAction,
  deleteInventoryItemAction,
  stockHistoryAction,
  updateInventoryItemAction,
  type InventoryItemInput,
  type MovementView,
} from "@/lib/actions/inventory";
import { ADJUST_REASONS, REASON_LABEL } from "@/lib/stock-reasons";
import { formatMoney } from "@/lib/types";
import { AlertTriangle, ClipboardCheck, History, Package, PackagePlus, Pencil, Plus, Search, SlidersHorizontal, Trash2, Truck, X } from "lucide-react";

type Filter = "all" | "low" | "out" | "negative";

const stateOf = (r: StockRow): Exclude<Filter, "all"> | "ok" =>
  r.quantity < 0 ? "negative" : r.quantity === 0 ? "out" : r.quantity <= r.lowStockThreshold ? "low" : "ok";

const qty = (n: number) => Math.round(n * 1000) / 1000;

// productWord: "dish" or "product" (lib/business-profile.ts). `purchasing`: the Suppliers / Purchase
// orders / Stocktake feature is on, so their shortcuts show here.
export function InventoryClient({
  items,
  suppliers,
  categories,
  productWord = "dish",
  purchasing = false,
  features = {},
  canTransfer = false,
  currencySymbol,
}: {
  items: StockRow[];
  suppliers: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  productWord?: string;
  purchasing?: boolean;
  features?: { locations?: boolean; batches?: boolean };
  // A login that manages 2+ sites can move stock between them (step 6.5).
  canTransfer?: boolean;
  currencySymbol: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<StockRow | "new" | null>(null);
  const [adjustFor, setAdjustFor] = useState<StockRow | null>(null);
  const [historyFor, setHistoryFor] = useState<StockRow | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");

  const counts = useMemo(() => {
    const c = { all: items.length, low: 0, out: 0, negative: 0 };
    for (const r of items) {
      const s = stateOf(r);
      if (s !== "ok") c[s]++;
    }
    return c;
  }, [items]);
  const totalValue = items.reduce((s, r) => s + r.value, 0);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((r) => {
      if (filter !== "all" && stateOf(r) !== filter) return false;
      if (category && r.categoryId !== category) return false;
      if (supplier && r.supplierId !== supplier) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || (r.sku ?? "").toLowerCase().includes(q) || r.barcodes.some((b) => b.includes(q));
    });
  }, [items, filter, category, supplier, search]);

  function handleDelete(item: StockRow) {
    if (!confirm(`Delete "${item.name}" from stock?`)) return;
    startTransition(async () => {
      await deleteInventoryItemAction(item.id);
      router.refresh();
    });
  }

  const tab = (f: Filter, label: string, tone: string) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      className={`rounded-full px-3 py-1.5 text-sm font-medium ${filter === f ? "bg-[var(--brand)] text-white" : `bg-white ${tone} border border-neutral-200 hover:bg-neutral-50`}`}
    >
      {label} <span className="opacity-70">{counts[f]}</span>
    </button>
  );

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{purchasing ? "Stock" : "Inventory"}</h1>
          <p className="text-sm text-neutral-400">
            Every change is recorded — open an item&apos;s history to see why it moved. Link a {productWord} to an item (or tick Track stock on a product) and each sale takes it off.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/inventory/goods-in" className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
            <PackagePlus className="h-4 w-4" /> Goods in
          </Link>
          {purchasing && (
            <>
              <Link href="/inventory/reorder" className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                <Truck className="h-4 w-4" /> Reorder
              </Link>
              <Link href="/inventory/serials" className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                <Search className="h-4 w-4" /> Serials
              </Link>
              {canTransfer && (
                <Link href="/transfers" className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                  Transfers
                </Link>
              )}
              {features.batches && (
                <Link href="/inventory/expiry" className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                  Expiry
                </Link>
              )}
              <Link href="/stocktake" className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                <ClipboardCheck className="h-4 w-4" /> Stocktake
              </Link>
            </>
          )}
          <button
            onClick={() => setEditing("new")}
            className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
          >
            <Plus className="h-4 w-4" /> New Item
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Stock value (at cost)" value={formatMoney(totalValue, currencySymbol)} />
        <Stat label="Items" value={String(items.length)} />
        <Stat label="Running low" value={String(counts.low)} tone={counts.low ? "text-amber-600" : undefined} />
        <Stat label="Out of stock" value={String(counts.out + counts.negative)} tone={counts.out + counts.negative ? "text-rose-600" : undefined} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU or scan a barcode"
            aria-label="Search stock"
            className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500"
          />
        </div>
        {tab("all", "All", "text-neutral-600")}
        {tab("low", "Low", "text-amber-700")}
        {tab("out", "Out", "text-rose-600")}
        {counts.negative > 0 && tab("negative", "Below zero", "text-rose-700")}
        {categories.length > 0 && (
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm">
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {suppliers.length > 0 && (
          <select value={supplier} onChange={(e) => setSupplier(e.target.value)} aria-label="Supplier" className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm">
            <option value="">All suppliers</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-5 py-3">Item</th>
              <th className="px-4 py-3">In stock</th>
              <th className="px-4 py-3">Low at</th>
              <th className="px-4 py-3 text-right">Cost</th>
              <th className="px-4 py-3 text-right">Value</th>
              <th className="px-4 py-3">Last change</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {shown.map((item) => {
              const state = stateOf(item);
              const tone = state === "negative" ? "text-rose-600" : state === "out" ? "text-rose-600" : state === "low" ? "text-amber-700" : "text-neutral-800";
              return (
                <tr key={item.id} className={state === "negative" || state === "out" ? "bg-rose-50/50" : state === "low" ? "bg-amber-50/40" : undefined}>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-light)] text-[var(--brand-dark)]">
                        <Package className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-neutral-800">{item.name}</span>
                          {state !== "ok" && <AlertTriangle className={`h-3.5 w-3.5 ${state === "low" ? "text-amber-500" : "text-rose-500"}`} />}
                        </div>
                        <div className="text-xs text-neutral-400">
                          {[item.sku, item.categoryName, item.supplierName].filter(Boolean).join(" · ") || (item.dishId ? "" : "Ingredient / supply")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`px-4 py-3 font-semibold ${tone}`} title={state === "negative" ? "Below zero — more was sold than was in stock" : undefined}>
                    {qty(item.quantity)} {item.unit}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {item.lowStockThreshold} {item.unit}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-500">{item.costPrice != null ? formatMoney(item.costPrice, currencySymbol) : "—"}</td>
                  <td className="px-4 py-3 text-right font-medium text-neutral-700">{item.costPrice != null ? formatMoney(item.value, currencySymbol) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-neutral-400">{item.lastChange ? new Date(item.lastChange).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => setHistoryFor(item)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-[var(--brand-dark)]" title="History — why it changed" aria-label={`History of ${item.name}`}>
                        <History className="h-4 w-4" />
                      </button>
                      <button onClick={() => setAdjustFor(item)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-[var(--brand-dark)]" title="Adjust stock" aria-label={`Adjust ${item.name}`}>
                        <SlidersHorizontal className="h-4 w-4" />
                      </button>
                      <button onClick={() => setEditing(item)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-[var(--brand-dark)]" title="Edit" aria-label={`Edit ${item.name}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(item)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600" title="Delete" aria-label={`Delete ${item.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-neutral-400">
                  {items.length === 0 ? "No stock items yet." : "Nothing matches."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ItemModal
          initial={editing === "new" ? null : editing}
          suppliers={suppliers}
          currencySymbol={currencySymbol}
          onClose={() => setEditing(null)}
          onSave={(input) => {
            const row = editing;
            setEditing(null);
            startTransition(async () => {
              if (row !== "new") await updateInventoryItemAction(row.id, input);
              else await createInventoryItemAction(input);
              router.refresh();
            });
          }}
        />
      )}
      {adjustFor && <AdjustModal item={adjustFor} onClose={() => setAdjustFor(null)} onDone={() => router.refresh()} />}
      {historyFor && <HistoryDrawer item={historyFor} currencySymbol={currencySymbol} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
      <div className="text-xs font-medium text-neutral-400">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold ${tone ?? "text-neutral-900"}`}>{value}</div>
    </div>
  );
}

function ItemModal({
  initial,
  suppliers,
  currencySymbol,
  onClose,
  onSave,
}: {
  initial: StockRow | null;
  suppliers: { id: string; name: string }[];
  currencySymbol: string;
  onClose: () => void;
  onSave: (input: InventoryItemInput) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "pcs");
  const [quantity, setQuantity] = useState("0");
  const [low, setLow] = useState(initial ? String(initial.lowStockThreshold) : "0");
  const [cost, setCost] = useState(initial?.costPrice != null ? String(initial.costPrice) : "");
  const [reorderLevel, setReorderLevel] = useState(initial?.reorderLevel != null ? String(initial.reorderLevel) : "");
  const [reorderQty, setReorderQty] = useState(initial?.reorderQty != null ? String(initial.reorderQty) : "");
  const [supplierId, setSupplierId] = useState(initial?.supplierId ?? "");
  const [error, setError] = useState<string | null>(null);
  const ownedByProduct = !!initial?.dishId;
  const field = "w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 disabled:bg-neutral-50 disabled:text-neutral-400";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{initial ? "Edit Item" : "New Stock Item"}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-neutral-500">Item Name</label>
        <input value={name} disabled={ownedByProduct} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken Breast" className={`mb-4 ${field}`} />
        {ownedByProduct && <p className="-mt-3 mb-4 text-xs text-neutral-400">This is a product&apos;s own stock — rename it on the Products screen.</p>}

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Unit</label>
            <input value={unit} disabled={ownedByProduct} onChange={(e) => setUnit(e.target.value)} placeholder="kg, L, pcs…" className={field} />
          </div>
          {!initial && (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-500">Starting Quantity</label>
              <input type="number" min="0" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={field} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Cost per {unit || "unit"} ({currencySymbol})</label>
            <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Low stock at</label>
            <input type="number" min="0" step="0.01" value={low} onChange={(e) => setLow(e.target.value)} className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Reorder when at or below</label>
            <input type="number" min="0" step="0.01" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} placeholder="Same as low stock" className={field} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Order this many</label>
            <input type="number" min="0" step="0.01" value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} placeholder="Automatic" className={field} />
          </div>
        </div>

        {suppliers.length > 0 && (
          <>
            <label className="mb-1 block text-xs font-medium text-neutral-500">Supplier</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`mb-4 ${field}`}>
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        )}
        <p className="mb-4 text-xs text-neutral-400">Flagged as low stock once the quantity drops to the low-stock level or below.</p>
        {error && <p className="mb-4 text-xs font-medium text-rose-600">{error}</p>}

        <button
          onClick={() => {
            if (!name.trim()) return setError("Enter an item name.");
            const q = Number(quantity);
            if (!initial && (!Number.isFinite(q) || q < 0)) return setError("Enter a valid starting quantity.");
            onSave({
              name: name.trim(),
              unit,
              quantity: q,
              lowStockThreshold: Number(low) || 0,
              costPrice: cost === "" ? null : Number(cost),
              reorderLevel: reorderLevel === "" ? null : Number(reorderLevel),
              reorderQty: reorderQty === "" ? null : Number(reorderQty),
              supplierId: supplierId || null,
            });
          }}
          className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)]"
        >
          {initial ? "Save Changes" : "Create Item"}
        </button>
      </div>
    </div>
  );
}

function AdjustModal({ item, onClose, onDone }: { item: StockRow; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>("Correction");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(sign: 1 | -1) {
    const value = Number(amount);
    if (!value || value <= 0) {
      setError("Enter a positive amount.");
      return;
    }
    startTransition(async () => {
      const result = await adjustInventoryStockAction(item.id, value * sign, reason, note);
      if (result.error) {
        setError(result.error);
        return;
      }
      onDone();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Adjust stock">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Adjust Stock</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-3 text-sm text-neutral-500">
          {item.name} — currently{" "}
          <span className="font-semibold text-neutral-800">
            {qty(item.quantity)} {item.unit}
          </span>
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
        <div className="mb-3 grid grid-cols-3 gap-2">
          {ADJUST_REASONS.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => setReason(r.label)}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium ${reason === r.label ? "border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand-dark)]" : "border-neutral-200 text-neutral-600"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="mb-3 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500" />
        {error && <p className="mb-3 text-xs font-medium text-rose-600">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <button disabled={pending} onClick={() => apply(-1)} className="rounded-xl border border-rose-200 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
            Remove
          </button>
          <button disabled={pending} onClick={() => apply(1)} className="rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryDrawer({ item, currencySymbol, onClose }: { item: StockRow; currencySymbol: string; onClose: () => void }) {
  const [rows, setRows] = useState<MovementView[] | null>(null);
  useEffect(() => {
    let alive = true;
    stockHistoryAction(item.id).then((r) => alive && setRows(r));
    return () => {
      alive = false;
    };
  }, [item.id]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`History of ${item.name}`}>
        <div className="flex items-start justify-between border-b border-neutral-100 p-5">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{item.name}</h2>
            <p className="text-sm text-neutral-500">
              {qty(item.quantity)} {item.unit} in stock — why it changed
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close history">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!rows ? (
            <p className="p-5 text-sm text-neutral-400">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="p-5 text-sm text-neutral-400">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {rows.map((m) => (
                <li key={m.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-neutral-800">{REASON_LABEL[m.reason] ?? m.reason}</div>
                    <div className="text-xs text-neutral-400">
                      {new Date(m.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      {m.by ? ` · ${m.by}` : ""}
                    </div>
                    {(m.note || m.refLabel) && (
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {m.note}
                        {m.note && m.refLabel ? " · " : ""}
                        {m.refLabel && m.refHref && (
                          <Link href={m.refHref} className="font-medium text-[var(--brand-dark)] hover:underline">
                            {m.refLabel}
                          </Link>
                        )}
                      </div>
                    )}
                    {m.unitCost != null && <div className="text-xs text-neutral-400">at {formatMoney(m.unitCost, currencySymbol)} each</div>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={`text-sm font-semibold ${m.change > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {m.change > 0 ? "+" : ""}
                      {qty(m.change)}
                    </div>
                    <div className="text-xs text-neutral-400">→ {qty(m.quantityAfter)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}
