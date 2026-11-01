"use client";

import { useState } from "react";
import { Barcode, ChevronDown, Plus, Trash2, X } from "lucide-react";
import type { Category, Dish, InventoryItem, Printer } from "@/lib/types";
import type { DishInput } from "@/lib/actions/menu";
import { nextInternalBarcodeAction } from "@/lib/actions/menu";
import { SYMBOLOGY_LABEL, checkBarcode } from "@/lib/barcode";
import { SELL_BY_OPTIONS, UNITS_BY_SELL_BY, unitPriceLabel, type SellBy } from "@/lib/units";

const EMOJI_PRESETS = [
  "🍔", "🍕", "🍝", "🥗", "🍗", "🥩", "🍤", "🍜", "🍛", "🍣",
  "🥞", "🧇", "🥐", "🧁", "🍰", "🍮", "🍨", "🍫", "🥤", "☕",
  "🍹", "🌮", "🌯", "🥪", "🍟", "🍲", "🍅", "🥑", "🍳", "🥣",
  "🍎", "🍌", "🥛", "🥚", "🍞", "🧀", "🥫", "🧃", "🍷", "🍺",
  "🧴", "🧻", "🧼", "👕", "👟", "📱", "🔋", "🔧", "🎁", "📦",
];

const INPUT =
  "w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-neutral-50 disabled:text-neutral-400";
const LABEL = "mb-1.5 block text-xs font-medium text-neutral-500";

interface DishModalProps {
  onClose: () => void;
  // Resolves with an error to show on the form (e.g. a barcode already in use), or nothing when saved.
  onSave: (values: DishInput) => Promise<string | undefined | void>;
  categories: Category[];
  printers: Printer[];
  inventoryItems?: InventoryItem[];
  defaultCategoryId: string;
  initial?: Dish | null;
  initialBarcodes?: { code: string; packQty: number }[];
  // The product's own stock item (dishes.trackStock), when it has one.
  ownStock?: { quantity: number; lowStockThreshold: number } | null;
  currencySymbol?: string;
  // "Dish" or "Product" (lib/business-profile.ts).
  productWord?: string;
  // Shops open the barcode/stock sections by default and default "Track stock" on.
  isShop?: boolean;
}

// Mount this component only while the modal should be visible (e.g. `{open && <DishModal ... />}`)
// so a fresh instance — and fresh initial state — is created each time it opens.
export function DishModal({
  onClose,
  onSave,
  categories,
  printers,
  inventoryItems = [],
  defaultCategoryId,
  initial,
  initialBarcodes = [],
  ownStock = null,
  currencySymbol = "£",
  productWord = "Dish",
  isShop = false,
}: DishModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [categoryId, setCategoryId] = useState(
    initial?.categoryId ?? (defaultCategoryId === "all" ? categories[0]?.id ?? "" : defaultCategoryId)
  );
  const [sellBy, setSellBy] = useState<SellBy>((initial?.sellBy as SellBy) ?? "unit");
  const [unit, setUnit] = useState(initial?.unit ?? "each");
  const [price, setPrice] = useState(initial ? String(initial.price) : "");
  const [emoji, setEmoji] = useState(initial?.emoji ?? (isShop ? "📦" : "🍽️"));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.imageUrl ?? "");
  // Defaults to the dish's own printer if it has one, otherwise falls back to its category's
  // printer — so a new dish is routed sensibly from the start, but can be pointed elsewhere.
  const [printerId, setPrinterId] = useState(
    initial?.printerId ?? categories.find((c) => c.id === categoryId)?.printerId ?? ""
  );
  const [barcodes, setBarcodes] = useState(initialBarcodes.map((b) => ({ code: b.code, packQty: String(b.packQty) })));
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [barcodeError, setBarcodeError] = useState<string | null>(null);
  const [trackStock, setTrackStock] = useState(initial ? initial.trackStock : isShop);
  const [stockQty, setStockQty] = useState(ownStock ? String(Math.round(ownStock.quantity * 1000) / 1000) : "");
  const [lowStock, setLowStock] = useState(ownStock ? String(ownStock.lowStockThreshold) : "");
  const [inventoryItemId, setInventoryItemId] = useState(initial?.trackStock ? "" : (initial?.inventoryItemId ?? ""));
  const [inventoryUsagePerOrder, setInventoryUsagePerOrder] = useState(
    initial?.inventoryUsagePerOrder ? String(initial.inventoryUsagePerOrder) : "1"
  );
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [brand, setBrand] = useState(initial?.brand ?? "");
  const [costPrice, setCostPrice] = useState(initial?.costPrice != null ? String(initial.costPrice) : "");
  const [vat, setVat] = useState(initial?.taxRateOverride != null ? String(initial.taxRateOverride) : "");
  const [minAge, setMinAge] = useState(initial?.minAge ? String(initial.minAge) : "");
  const [minQty, setMinQty] = useState(initial?.minQty != null ? String(initial.minQty) : "");
  const [tare, setTare] = useState(initial?.tare != null ? String(initial.tare) : "");
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = name.trim().length > 0 && categoryId && Number(price) > 0 && !saving;
  const measured = sellBy !== "unit";
  const stockUnit = measured ? unit : "pcs";
  const priceNum = Number(price) || 0;
  const costNum = Number(costPrice);
  const margin = priceNum > 0 && costPrice !== "" && Number.isFinite(costNum) ? ((priceNum - costNum) / priceNum) * 100 : null;
  const perUnitHint = measured ? unitPriceLabel(priceNum, unit, currencySymbol) : null;
  const ownStockItemIds = new Set(inventoryItems.filter((i) => i.dishId).map((i) => i.id));
  const ingredientItems = inventoryItems.filter((i) => !ownStockItemIds.has(i.id));
  const allowedOwnId = initial?.inventoryItemId && initial.trackStock ? initial.inventoryItemId : null;

  function chooseSellBy(next: SellBy) {
    setSellBy(next);
    setUnit(UNITS_BY_SELL_BY[next][0]);
  }

  function addBarcode(raw: string) {
    const check = checkBarcode(raw);
    if (!check.ok) {
      setBarcodeError(check.message ?? "That barcode isn't valid.");
      return;
    }
    if (barcodes.some((b) => b.code === check.code)) {
      setBarcodeError("Already on this product.");
      return;
    }
    setBarcodes((prev) => [...prev, { code: check.code, packQty: "1" }]);
    setBarcodeDraft("");
    setBarcodeError(null);
  }

  async function makeBarcode() {
    const result = await nextInternalBarcodeAction();
    if (result.code) addBarcode(result.code);
    else setBarcodeError(result.error ?? "Couldn't make a barcode.");
  }

  async function save() {
    if (!canSave) return;
    // A code typed (or scanned) but not yet added still counts.
    const pending = barcodeDraft.trim() ? checkBarcode(barcodeDraft) : null;
    if (pending && !pending.ok) {
      setBarcodeError(pending.message ?? "That barcode isn't valid.");
      return;
    }
    const allBarcodes = [...barcodes, ...(pending && !barcodes.some((b) => b.code === pending.code) ? [{ code: pending.code, packQty: "1" }] : [])];
    setSaving(true);
    setError(null);
    const message = await onSave({
      name: name.trim(),
      categoryId,
      price: priceNum,
      emoji,
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      printerId: printerId || null,
      inventoryItemId: trackStock ? null : inventoryItemId || null,
      inventoryUsagePerOrder: !trackStock && inventoryItemId ? Number(inventoryUsagePerOrder) || null : null,
      sellBy,
      unit,
      minQty: measured && minQty !== "" ? Number(minQty) : null,
      tare: measured && tare !== "" ? Number(tare) : null,
      sku: sku.trim(),
      brand: brand.trim(),
      costPrice: costPrice !== "" ? Number(costPrice) : null,
      taxRateOverride: vat !== "" ? Number(vat) : null,
      minAge: minAge ? Number(minAge) : null,
      barcodes: allBarcodes.map((b) => ({ code: b.code, packQty: Number(b.packQty) || 1 })),
      trackStock,
      stockQty: trackStock && stockQty !== "" ? Number(stockQty) : null,
      lowStock: trackStock && lowStock !== "" ? Number(lowStock) : null,
    });
    setSaving(false);
    if (message) setError(message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between px-6 pb-3 pt-6">
          <h2 className="text-lg font-semibold text-neutral-900">{initial ? `Edit ${productWord}` : `Add New ${productWord}`}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 pb-2">
          <div>
            <label className={LABEL}>{productWord} Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={isShop ? "e.g. Semi-skimmed Milk 1L" : "e.g. Belgian Waffles"} className={INPUT} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Category</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={INPUT}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Sold by</label>
              <div className="flex rounded-xl border border-neutral-200 p-1" role="radiogroup" aria-label="Sold by">
                {SELL_BY_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={sellBy === o.value}
                    onClick={() => chooseSellBy(o.value)}
                    className={`flex-1 rounded-lg py-1.5 text-xs font-semibold ${sellBy === o.value ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>
                Price ({currencySymbol}){measured ? ` per ${unit}` : ""}
              </label>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                inputMode="decimal"
                className={INPUT}
              />
              {perUnitHint && <p className="mt-1 text-xs text-neutral-400">= {perUnitHint}</p>}
            </div>
            <div>
              <label className={LABEL}>{measured ? "Priced per" : "Sold as"}</label>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className={INPUT}>
                {UNITS_BY_SELL_BY[sellBy].map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Barcodes */}
          <div>
            <label className={LABEL}>Barcodes</label>
            {barcodes.length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {barcodes.map((b, i) => {
                  const check = checkBarcode(b.code);
                  return (
                    <li key={b.code} className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-sm">
                      <Barcode className="h-4 w-4 shrink-0 text-neutral-400" />
                      <span className="min-w-0 flex-1 truncate font-mono text-neutral-800">{b.code}</span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${check.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                        {SYMBOLOGY_LABEL[check.symbology]} {check.ok ? "✓" : "✗"}
                      </span>
                      <label className="flex shrink-0 items-center gap-1 text-xs text-neutral-500" title="How many one scan adds — e.g. 12 for a case barcode">
                        ×
                        <input
                          value={b.packQty}
                          onChange={(e) => setBarcodes((prev) => prev.map((x, j) => (j === i ? { ...x, packQty: e.target.value.replace(/[^0-9.]/g, "") } : x)))}
                          inputMode="decimal"
                          className="w-12 rounded-lg border border-neutral-200 px-1.5 py-1 text-center text-xs outline-none focus:border-teal-500"
                          aria-label="Pack quantity"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setBarcodes((prev) => prev.filter((_, j) => j !== i))}
                        className="shrink-0 rounded-lg p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                        aria-label={`Remove barcode ${b.code}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex gap-2">
              <input
                value={barcodeDraft}
                onChange={(e) => {
                  setBarcodeDraft(e.target.value);
                  setBarcodeError(null);
                }}
                onKeyDown={(e) => {
                  // A scanner types the code and presses Enter.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (barcodeDraft.trim()) addBarcode(barcodeDraft);
                  }
                }}
                placeholder="Scan or type a barcode"
                className={`${INPUT} font-mono`}
                aria-label="New barcode"
              />
              <button
                type="button"
                onClick={() => barcodeDraft.trim() && addBarcode(barcodeDraft)}
                className="flex shrink-0 items-center gap-1 rounded-xl border border-neutral-200 px-3 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            {barcodeError && <p className="mt-1 text-xs font-medium text-rose-600">{barcodeError}</p>}
            <button type="button" onClick={makeBarcode} className="mt-1.5 text-xs font-semibold text-[var(--brand)] hover:underline">
              No barcode? Make one for this {productWord.toLowerCase()}
            </button>
          </div>

          {/* Stock */}
          <div className="rounded-xl border border-neutral-200 p-3">
            <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-neutral-800">
              <input type="checkbox" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
              Track stock for this {productWord.toLowerCase()}
            </label>
            {trackStock ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>In stock now ({stockUnit})</label>
                  <input
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value.replace(/[^0-9.-]/g, ""))}
                    placeholder="0"
                    inputMode="decimal"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className={LABEL}>Low stock at ({stockUnit})</label>
                  <input value={lowStock} onChange={(e) => setLowStock(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" inputMode="decimal" className={INPUT} />
                </div>
                <p className="col-span-2 -mt-1 text-xs text-neutral-400">
                  Every sale takes it off; voids and edits put it back. Changing &ldquo;In stock now&rdquo; is recorded as a count.
                </p>
              </div>
            ) : (
              ingredientItems.length > 0 && (
                <div className="mt-3">
                  <label className={LABEL}>Or use an ingredient / stock item (optional)</label>
                  <div className="grid grid-cols-2 gap-3">
                    <select value={inventoryItemId} onChange={(e) => setInventoryItemId(e.target.value)} className={INPUT}>
                      <option value="">Not tracked</option>
                      {ingredientItems
                        .filter((i) => i.id !== allowedOwnId)
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.name} ({i.unit})
                          </option>
                        ))}
                    </select>
                    <input
                      value={inventoryUsagePerOrder}
                      onChange={(e) => setInventoryUsagePerOrder(e.target.value.replace(/[^0-9.]/g, ""))}
                      disabled={!inventoryItemId}
                      placeholder="Used per order"
                      inputMode="decimal"
                      className={INPUT}
                    />
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">Selling one takes this amount off the item — e.g. a cappuccino uses 0.2 L of milk.</p>
                </div>
              )
            )}
          </div>

          {/* More details */}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl bg-neutral-50 px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100"
            aria-expanded={moreOpen}
          >
            More details — SKU, cost, VAT, age, photo, printer
            <ChevronDown className={`h-4 w-4 transition-transform ${moreOpen ? "rotate-180" : ""}`} />
          </button>
          {moreOpen && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>SKU / product code</label>
                  <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Optional" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>Brand</label>
                  <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Optional" className={INPUT} />
                </div>
                <div>
                  <label className={LABEL}>
                    Cost price ({currencySymbol}){measured ? ` per ${unit}` : ""}
                  </label>
                  <input value={costPrice} onChange={(e) => setCostPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="What you pay" inputMode="decimal" className={INPUT} />
                  {margin !== null && (
                    <p className={`mt-1 text-xs ${margin < 0 ? "text-rose-600" : "text-neutral-400"}`}>
                      Margin {margin.toFixed(1)}% · {currencySymbol}
                      {(priceNum - costNum).toFixed(2)}
                    </p>
                  )}
                </div>
                <div>
                  <label className={LABEL}>VAT</label>
                  <select value={["", "0", "5", "20"].includes(vat) ? vat : "custom"} onChange={(e) => setVat(e.target.value === "custom" ? "12.5" : e.target.value)} className={INPUT}>
                    <option value="">Category default</option>
                    <option value="0">0% (zero-rated)</option>
                    <option value="5">5% (reduced)</option>
                    <option value="20">20% (standard)</option>
                    <option value="custom">Other…</option>
                  </select>
                  {!["", "0", "5", "20"].includes(vat) && (
                    <input value={vat} onChange={(e) => setVat(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className={`${INPUT} mt-2`} aria-label="VAT %" />
                  )}
                </div>
                <div>
                  <label className={LABEL}>Age restriction</label>
                  <select value={minAge} onChange={(e) => setMinAge(e.target.value)} className={INPUT}>
                    <option value="">None</option>
                    <option value="16">16+</option>
                    <option value="18">18+ (alcohol, tobacco, knives)</option>
                    <option value="21">21+</option>
                    <option value="25">25+</option>
                  </select>
                </div>
                {measured && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={LABEL}>Smallest sale</label>
                      <input value={minQty} onChange={(e) => setMinQty(e.target.value.replace(/[^0-9.]/g, ""))} placeholder={unit} inputMode="decimal" className={INPUT} />
                    </div>
                    <div>
                      <label className={LABEL}>Tare ({unit})</label>
                      <input value={tare} onChange={(e) => setTare(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" inputMode="decimal" className={INPUT} />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className={LABEL}>Photo URL (optional)</label>
                <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/photo.jpg" className={INPUT} />
                <p className="mt-1 text-xs text-neutral-400">Shown instead of the icon below when set.</p>
              </div>

              <div>
                <label className={LABEL}>Icon</label>
                <div className="grid grid-cols-10 gap-1.5 rounded-xl border border-neutral-200 p-2">
                  {EMOJI_PRESETS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEmoji(e)}
                      className={`flex h-7 w-7 items-center justify-center rounded-lg text-base transition-colors ${
                        emoji === e ? "bg-teal-100 ring-2 ring-teal-500" : "hover:bg-neutral-100"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {printers.length > 0 && (
                <div>
                  <label className={LABEL}>Printer / Kitchen Station</label>
                  <select value={printerId} onChange={(e) => setPrinterId(e.target.value)} className={INPUT}>
                    <option value="">No printer</option>
                    {printers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.isDefault ? " (Default)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-neutral-400">
                    Defaults to the category&rsquo;s — change it only if this item needs a different station.
                  </p>
                </div>
              )}

              <div>
                <label className={LABEL}>Description (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Short description"
                  className={`${INPUT} resize-none`}
                />
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 px-6 pb-6 pt-3">
          {error && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50">
              Cancel
            </button>
            <button
              disabled={!canSave}
              onClick={save}
              className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Saving…" : initial ? "Save Changes" : `Add ${productWord}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
