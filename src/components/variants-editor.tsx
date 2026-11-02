"use client";

import { Plus, X } from "lucide-react";
import { cleanOptions, combinations, comboKey, variantLabel, type VariantOption } from "@/lib/variants";
import type { VariantDetail } from "@/lib/data/menu";
import type { VariantInput } from "@/lib/variants-server";

// The "Sizes, colours…" part of the product form (docs/retail-plan step 5.1): define the options,
// get a grid of every combination, fill in each one's SKU, barcode, price, cost and stock.
export interface VariantRowState {
  sku: string;
  barcode: string;
  price: string;
  cost: string;
  stock: string;
  low: string;
  active: boolean;
}
export interface VariantsState {
  enabled: boolean;
  options: { name: string; valuesText: string }[];
  rows: Record<string, VariantRowState>;
}

const blankRow = (): VariantRowState => ({ sku: "", barcode: "", price: "", cost: "", stock: "", low: "", active: true });

const parseValues = (t: string) => t.split(",").map((v) => v.trim()).filter(Boolean);
const optionsOf = (s: VariantsState): VariantOption[] => cleanOptions(s.options.map((o) => ({ name: o.name, values: parseValues(o.valuesText) })));

export function initialVariantsState(optionsSaved: VariantOption[] | null | undefined, variants: VariantDetail[] = []): VariantsState {
  const options = optionsSaved && optionsSaved.length ? optionsSaved : [];
  const rows: Record<string, VariantRowState> = {};
  for (const v of variants) {
    rows[comboKey(v.options, options)] = {
      sku: v.sku ?? "",
      barcode: v.barcode ?? "",
      price: v.price != null ? String(v.price) : "",
      cost: v.costPrice != null ? String(v.costPrice) : "",
      stock: v.qty != null ? String(Math.round(v.qty * 1000) / 1000) : "",
      low: v.qty != null ? String(v.low) : "",
      active: v.active,
    };
  }
  return {
    enabled: options.length > 0,
    options: options.length ? options.map((o) => ({ name: o.name, valuesText: o.values.join(", ") })) : [{ name: "Size", valuesText: "" }],
    rows,
  };
}

// What the server action takes. Nothing when variants are switched off or incomplete.
export function variantsPayload(s: VariantsState): { variantOptions: VariantOption[]; variants: VariantInput[] } {
  if (!s.enabled) return { variantOptions: [], variants: [] };
  const options = optionsOf(s);
  const variants = combinations(options).map((combo) => {
    const r = s.rows[comboKey(combo, options)] ?? blankRow();
    return {
      options: combo,
      sku: r.sku.trim(),
      barcode: r.barcode.trim(),
      price: r.price === "" ? null : Number(r.price),
      costPrice: r.cost === "" ? null : Number(r.cost),
      stockQty: r.stock === "" ? null : Number(r.stock),
      lowStock: r.low === "" ? null : Number(r.low),
      active: r.active,
    };
  });
  return { variantOptions: options, variants };
}

export function VariantsEditor({ state, onChange, currencySymbol, basePrice }: { state: VariantsState; onChange: (s: VariantsState) => void; currencySymbol: string; basePrice: number }) {
  const options = optionsOf(state);
  const combos = combinations(options);
  const input = "w-full min-w-[4.5rem] rounded-lg border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500";

  const setRow = (key: string, patch: Partial<VariantRowState>) => onChange({ ...state, rows: { ...state.rows, [key]: { ...(state.rows[key] ?? blankRow()), ...patch } } });

  return (
    <div className="rounded-xl border border-neutral-200 p-3">
      <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-neutral-800">
        <input type="checkbox" checked={state.enabled} onChange={(e) => onChange({ ...state, enabled: e.target.checked })} className="h-4 w-4 accent-[var(--brand)]" />
        Comes in sizes, colours or other options
      </label>
      {state.enabled && (
        <div className="mt-3 space-y-3">
          {state.options.map((o, i) => (
            <div key={i} className="grid grid-cols-[8rem_1fr_auto] items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Option</label>
                <input value={o.name} onChange={(e) => onChange({ ...state, options: state.options.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Size" aria-label={`Option ${i + 1} name`} className={input} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Values, separated by commas</label>
                <input value={o.valuesText} onChange={(e) => onChange({ ...state, options: state.options.map((x, j) => (j === i ? { ...x, valuesText: e.target.value } : x)) })} placeholder="S, M, L, XL" aria-label={`Option ${i + 1} values`} className={input} />
              </div>
              {state.options.length > 1 && (
                <button type="button" onClick={() => onChange({ ...state, options: state.options.filter((_, j) => j !== i) })} className="mb-1 rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove option">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          {state.options.length < 3 && (
            <button type="button" onClick={() => onChange({ ...state, options: [...state.options, { name: "", valuesText: "" }] })} className="flex items-center gap-1 text-xs font-semibold text-[var(--brand)] hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add another option (e.g. Colour)
            </button>
          )}

          {combos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="text-left text-xs font-medium text-neutral-400">
                  <tr>
                    <th className="pb-1 pr-2">Variant</th>
                    <th className="pb-1 pr-2">SKU</th>
                    <th className="pb-1 pr-2">Barcode</th>
                    <th className="pb-1 pr-2">Price ({currencySymbol})</th>
                    <th className="pb-1 pr-2">In stock</th>
                    <th className="pb-1">On</th>
                  </tr>
                </thead>
                <tbody>
                  {combos.map((c) => {
                    const key = comboKey(c, options);
                    const r = state.rows[key] ?? blankRow();
                    const label = variantLabel(c, options);
                    return (
                      <tr key={key} className={r.active ? "" : "opacity-50"}>
                        <td className="whitespace-nowrap py-1 pr-2 font-medium text-neutral-800">{label}</td>
                        <td className="py-1 pr-2">
                          <input value={r.sku} onChange={(e) => setRow(key, { sku: e.target.value })} aria-label={`SKU ${label}`} className={input} />
                        </td>
                        <td className="py-1 pr-2">
                          <input value={r.barcode} onChange={(e) => setRow(key, { barcode: e.target.value.replace(/\s/g, "") })} aria-label={`Barcode ${label}`} className={input} />
                        </td>
                        <td className="py-1 pr-2">
                          <input value={r.price} onChange={(e) => setRow(key, { price: e.target.value.replace(/[^0-9.]/g, "") })} placeholder={basePrice ? basePrice.toFixed(2) : "same"} inputMode="decimal" aria-label={`Price ${label}`} className={input} />
                        </td>
                        <td className="py-1 pr-2">
                          <input value={r.stock} onChange={(e) => setRow(key, { stock: e.target.value.replace(/[^0-9.-]/g, "") })} placeholder="—" inputMode="decimal" aria-label={`Stock ${label}`} className={input} />
                        </td>
                        <td className="py-1">
                          <input type="checkbox" checked={r.active} onChange={(e) => setRow(key, { active: e.target.checked })} aria-label={`${label} on`} className="h-4 w-4 accent-[var(--brand)]" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-neutral-400">Leave Price empty to use the product&apos;s price. Leave In stock empty if you don&apos;t count that variant.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
