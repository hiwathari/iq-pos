// How a product is sold (docs/retail-plan/03-products-units-weight-barcodes.md, step 2.1): by
// unit (each, pack…) or by weight / volume / length, with the price per that unit. Plain module —
// used by the product form, the Till, receipts and the server.

export type SellBy = "unit" | "weight" | "volume" | "length";

export const SELL_BY_OPTIONS: { value: SellBy; label: string }[] = [
  { value: "unit", label: "Unit" },
  { value: "weight", label: "Weight" },
  { value: "volume", label: "Volume" },
  { value: "length", label: "Length" },
];

export const UNITS_BY_SELL_BY: Record<SellBy, string[]> = {
  unit: ["each", "pack", "box", "case"],
  weight: ["kg", "g"],
  volume: ["l", "ml"],
  length: ["m", "cm"],
};

export function isSellBy(v: unknown): v is SellBy {
  return v === "unit" || v === "weight" || v === "volume" || v === "length";
}

export function isUnitFor(sellBy: SellBy, unit: unknown): unit is string {
  return typeof unit === "string" && UNITS_BY_SELL_BY[sellBy].includes(unit);
}

// The unit a stock item for this product is counted in (inventory_items.unit).
export function stockUnitFor(sellBy: SellBy, unit: string) {
  return sellBy === "unit" ? "pcs" : unit;
}

// "£2.40 / kg" for measured products, "£0.89" for unit ones ("each" is implied).
export function priceLabel(price: number, sellBy: SellBy | string | null | undefined, unit: string | null | undefined, symbol: string) {
  const money = `${symbol}${price.toFixed(2)}`;
  if (!sellBy || sellBy === "unit") return unit && unit !== "each" ? `${money} / ${unit}` : money;
  return `${money} / ${unit}`;
}

// Unit price for shelf labels (UK price marking): per 100 g for kg/g, per 100 ml for l/ml,
// per metre for m/cm. Null for unit products. `price` is per `unit`.
export function unitPriceLabel(price: number, unit: string | null | undefined, symbol: string) {
  const perBase: Record<string, [number, string]> = {
    kg: [0.1, "100 g"],
    g: [100, "100 g"],
    l: [0.1, "100 ml"],
    ml: [100, "100 ml"],
    m: [1, "m"],
    cm: [100, "m"],
  };
  const conv = unit ? perBase[unit] : undefined;
  if (!conv) return null;
  return `${symbol}${(price * conv[0]).toFixed(2)} per ${conv[1]}`;
}

// "0.734 kg", "3", "2 packs" — for cart lines, receipts and reports.
export function formatQty(qty: number, unit?: string | null, sellBy?: SellBy | string | null) {
  const n = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 1000) / 1000);
  if (!sellBy || sellBy === "unit") return n;
  return `${n} ${unit ?? ""}`.trim();
}

// How a sold line reads on a receipt: "2x Milk 1L", or for a weighed line the name with
// "0.734 kg @ £2.40/kg" underneath (returned as the second element).
export function receiptLine(
  item: { name: string; qty: number; price: number; sellBy?: string; unit?: string; fixedTotal?: number },
  symbol: string
): [string, string | null] {
  if (item.sellBy && item.sellBy !== "unit") {
    return [item.name, `${formatQty(item.qty, item.unit, item.sellBy)} @ ${symbol}${item.price.toFixed(2)}/${item.unit}`];
  }
  return [`${Number.isInteger(item.qty) ? item.qty : Math.round(item.qty * 1000) / 1000}x ${item.name}`, item.fixedTotal != null ? "label price" : null];
}

// The quantity in front of an item name anywhere it's listed: "2x" / "2×" for counted items,
// "0.734 kg" for measured ones.
export function qtyPrefix(item: { qty: number; sellBy?: string; unit?: string }, times = "x") {
  if (item.sellBy && item.sellBy !== "unit") return formatQty(item.qty, item.unit, item.sellBy);
  return `${Number.isInteger(item.qty) ? item.qty : Math.round(item.qty * 1000) / 1000}${times}`;
}
