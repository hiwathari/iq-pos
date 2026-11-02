// Product variants (docs/retail-plan step 5.1): the options a product comes in (Size: S, M, L;
// Colour: Blue, White) and the combinations they make. Plain module — used by the product form,
// the Till's picker and the server.

export interface VariantOption {
  name: string;
  values: string[];
}

export const MAX_OPTIONS = 3;
export const MAX_VARIANTS = 200;

// "M / Blue" — values in option order.
export function variantLabel(options: Record<string, string>, order: VariantOption[]) {
  return order.map((o) => options[o.name]).filter(Boolean).join(" / ");
}

// Every combination of the options' values, in order: [{Size:"S",Colour:"Blue"}, {Size:"S",Colour:"White"}, …]
export function combinations(options: VariantOption[]): Record<string, string>[] {
  const usable = options.filter((o) => o.name.trim() && o.values.length > 0);
  let out: Record<string, string>[] = [{}];
  for (const o of usable) {
    const next: Record<string, string>[] = [];
    for (const base of out) for (const v of o.values) next.push({ ...base, [o.name]: v });
    out = next;
  }
  return usable.length === 0 ? [] : out;
}

export const comboKey = (options: Record<string, string>, order: VariantOption[]) => order.map((o) => `${o.name}=${options[o.name] ?? ""}`).join("|");

// Cleans what the form sends: trimmed names, unique non-empty values, at most 3 options.
export function cleanOptions(raw: unknown): VariantOption[] {
  if (!Array.isArray(raw)) return [];
  const out: VariantOption[] = [];
  for (const o of raw.slice(0, MAX_OPTIONS)) {
    const name = String(o?.name ?? "").trim().slice(0, 30);
    const values = [...new Set((Array.isArray(o?.values) ? o.values : []).map((v: unknown) => String(v ?? "").trim().slice(0, 30)).filter(Boolean))] as string[];
    if (name && values.length && !out.some((x) => x.name === name)) out.push({ name, values: values.slice(0, 30) });
  }
  return out;
}

// What the Till and the online shop need to show a variant.
export interface VariantLite {
  id: string;
  name: string;
  price: number | null;
  qty: number | null; // null = stock not tracked
  low: number;
}
