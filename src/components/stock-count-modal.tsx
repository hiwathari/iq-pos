"use client";

import { useState, useTransition } from "react";
import { Minus, PackageX, Plus, Search, X } from "lucide-react";
import { setProductCountAction } from "@/lib/actions/stock-quick";
import type { Category, Dish } from "@/lib/types";

// The "Stock" panel on the Kitchen Display and the Till: each product with a count and − / +
// buttons, and a box to type the number. Counts go down by themselves as orders are taken (it is
// the product's own stock item, the same one the Stock page shows). A product nobody has counted
// stays "normal" — nothing changes until its + is pressed or a number is typed, which starts
// counting it from that number. The In stock / Out of stock pill is still there for a quick switch.
export function StockCountModal({
  categories,
  dishes,
  counts,
  source,
  onToggleOutOfStock,
  onChanged,
  onClose,
}: {
  categories: Category[];
  dishes: Dish[];
  // Own stock item of each counted product (products with sizes / options aren't listed here).
  counts: Record<string, { qty: number; unit: string }>;
  source: "kitchen" | "till";
  onToggleOutOfStock: (dish: Dish) => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  // What this panel has just changed, shown straight away; dropped whenever fresh numbers arrive.
  const [local, setLocal] = useState<Record<string, { qty: number; outOfStock: boolean }>>({});
  const [seen, setSeen] = useState(counts);
  if (seen !== counts) {
    setSeen(counts);
    setLocal({});
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  function apply(dish: Dish, change: { mode: "add" | "set"; amount: number }) {
    setBusy((b) => ({ ...b, [dish.id]: true }));
    setErrors((e) => {
      const { [dish.id]: _drop, ...rest } = e;
      void _drop;
      return rest;
    });
    startTransition(async () => {
      const res = await setProductCountAction(dish.id, change, source);
      setBusy((b) => ({ ...b, [dish.id]: false }));
      if (res.error || res.qty === undefined) {
        setErrors((e) => ({ ...e, [dish.id]: res.error ?? "Couldn't save." }));
        return;
      }
      setLocal((l) => ({ ...l, [dish.id]: { qty: res.qty!, outOfStock: !!res.outOfStock } }));
      onChanged();
    });
  }

  const q = search.trim().toLowerCase();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-neutral-900">
            <PackageX className="h-5 w-5 text-rose-500" /> Stock
          </h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="border-b border-neutral-100 px-5 py-2.5 text-xs text-neutral-400">
          Counts go down by themselves as orders are taken. Use + and − or type a number to set what is left. An item you don&rsquo;t count stays as it is —
          pressing + or typing a number starts counting it. Zero marks it out of stock.
        </p>
        <div className="relative border-b border-neutral-100 px-4 py-2.5">
          <Search className="pointer-events-none absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-300" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find an item…"
            aria-label="Find an item"
            className="w-full rounded-xl border border-neutral-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)]"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {categories.map((category) => {
            const list = dishes.filter((d) => d.categoryId === category.id && (!q || d.name.toLowerCase().includes(q)));
            if (list.length === 0) return null;
            return (
              <div key={category.id} className="mb-3">
                <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{category.name}</div>
                {list.map((dish) => {
                  const base = counts[dish.id];
                  const mine = local[dish.id];
                  const qty = mine ? mine.qty : base?.qty;
                  const out = mine ? mine.outOfStock : dish.outOfStock;
                  return (
                    <CountRow
                      key={`${dish.id}:${qty ?? "none"}`}
                      dish={dish}
                      qty={qty}
                      unit={base?.unit ?? (dish.sellBy === "unit" ? "pcs" : dish.unit)}
                      outOfStock={out}
                      busy={!!busy[dish.id]}
                      error={errors[dish.id]}
                      hasOptions={!!dish.variantOptions && dish.variantOptions.length > 0}
                      onAdd={(amount) => apply(dish, { mode: "add", amount })}
                      onSet={(amount) => apply(dish, { mode: "set", amount })}
                      onToggle={() => onToggleOutOfStock(dish)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CountRow({
  dish,
  qty,
  unit,
  outOfStock,
  busy,
  error,
  hasOptions,
  onAdd,
  onSet,
  onToggle,
}: {
  dish: Dish;
  qty: number | undefined;
  unit: string;
  outOfStock: boolean;
  busy: boolean;
  error?: string;
  hasOptions: boolean;
  onAdd: (amount: number) => void;
  onSet: (amount: number) => void;
  onToggle: () => void;
}) {
  const counted = qty !== undefined;
  const [draft, setDraft] = useState(counted ? String(Math.round(qty * 1000) / 1000) : "");

  function commit() {
    const raw = draft.trim();
    if (raw === "") return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return setDraft(counted ? String(qty) : "");
    if (counted && Math.abs(n - qty) < 1e-9) return;
    onSet(n);
  }

  return (
    <div className="rounded-xl px-2.5 py-2 hover:bg-neutral-50">
      <div className="flex items-center gap-2">
        <span className={`min-w-0 flex-1 truncate text-sm font-medium ${outOfStock ? "text-neutral-400 line-through" : "text-neutral-800"}`}>{dish.name}</span>
        {hasOptions ? (
          <span className="text-xs text-neutral-400">Sizes / options — use the Stock page</span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onAdd(-1)}
              disabled={busy || !counted || qty <= 0}
              aria-label={`One less ${dish.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ""))}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              inputMode="decimal"
              placeholder="–"
              aria-label={`${dish.name} count`}
              className={`h-9 w-16 rounded-lg border px-1 text-center text-sm font-bold outline-none focus:border-[var(--brand)] ${
                counted ? (qty <= 0 ? "border-rose-300 bg-rose-50 text-rose-700" : "border-neutral-200 text-neutral-800") : "border-dashed border-neutral-200 text-neutral-400"
              }`}
            />
            <button
              type="button"
              onClick={() => onAdd(1)}
              disabled={busy}
              aria-label={`One more ${dish.name}`}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
            </button>
            <span className="w-8 text-xs text-neutral-400">{counted && unit !== "pcs" ? unit : ""}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${outOfStock ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}
        >
          {outOfStock ? "Out" : "In"}
        </button>
      </div>
      {error && <div className="mt-1 text-xs font-medium text-rose-600">{error}</div>}
    </div>
  );
}
