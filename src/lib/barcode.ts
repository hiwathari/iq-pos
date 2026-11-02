// Barcodes on products (docs/retail-plan/03-products-units-weight-barcodes.md, step 2.2). Plain,
// dependency-free module: used by the product form (live checks), the server (validation) and
// later the Till's scanner. GTIN = the GS1 family: EAN-13, EAN-8, UPC-A, GTIN-14.

export type Symbology = "ean13" | "ean8" | "upca" | "gtin14" | "code128";

export const SYMBOLOGY_LABEL: Record<Symbology, string> = {
  ean13: "EAN-13",
  ean8: "EAN-8",
  upca: "UPC-A",
  gtin14: "GTIN-14",
  code128: "Code 128",
};

// Trim and drop spaces/dashes people type between digit groups; keeps leading zeros.
export function normaliseCode(raw: string) {
  const s = raw.trim();
  return /^[\d\s-]+$/.test(s) ? s.replace(/[\s-]/g, "") : s;
}

export function detectSymbology(code: string): Symbology {
  if (/^\d+$/.test(code)) {
    if (code.length === 8) return "ean8";
    if (code.length === 12) return "upca";
    if (code.length === 13) return "ean13";
    if (code.length === 14) return "gtin14";
  }
  return "code128";
}

// GS1 mod-10 check digit for the digits *before* the check digit.
export function gtinCheckDigit(body: string) {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(code: string) {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code.slice(-1));
}

// UPC-A is EAN-13 with a leading 0 — stored as EAN-13 so a UPC and its EAN form scan the same.
export function canonicalCode(code: string) {
  const c = normaliseCode(code);
  return detectSymbology(c) === "upca" ? `0${c}` : c;
}

export interface BarcodeCheck {
  code: string;
  symbology: Symbology;
  ok: boolean;
  message?: string;
}

// What the product form shows next to a barcode, and what the server enforces.
export function checkBarcode(raw: string): BarcodeCheck {
  const code = canonicalCode(raw);
  if (!code) return { code, symbology: "code128", ok: false, message: "Enter or scan a barcode." };
  if (code.length > 48) return { code, symbology: "code128", ok: false, message: "That's too long for a barcode." };
  const symbology = detectSymbology(code);
  if (symbology === "code128") {
    if (!/^[\x20-\x7e]+$/.test(code)) return { code, symbology, ok: false, message: "Use letters, numbers and simple symbols only." };
    return { code, symbology, ok: true };
  }
  if (!isValidGtin(code)) return { code, symbology, ok: false, message: "The check digit is wrong — scan it again or check the number." };
  return { code, symbology, ok: true };
}

// The store's own EAN-13 for products without one: prefix 20 (GS1's in-store range, so never a
// manufacturer's code; 21–29 are left for scale labels) + a 10-digit per-store sequence.
export function makeInternalEan13(seq: number) {
  const body = `20${String(seq).padStart(10, "0").slice(-10)}`;
  return `${body}${gtinCheckDigit(body)}`;
}

// ---- Drawing EAN-13 / EAN-8 as bars (for labels) ----

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

// Module string ("1" = bar, "0" = space) for a valid EAN-13 / EAN-8, or null for anything else.
export function eanModules(code: string): string | null {
  const c = canonicalCode(code);
  if (!isValidGtin(c)) return null;
  if (c.length === 13) {
    const parity = PARITY[Number(c[0])];
    let bits = "101";
    for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[Number(c[i])];
    bits += "01010";
    for (let i = 7; i <= 12; i++) bits += R[Number(c[i])];
    return bits + "101";
  }
  if (c.length === 8) {
    let bits = "101";
    for (let i = 0; i < 4; i++) bits += L[Number(c[i])];
    bits += "01010";
    for (let i = 4; i < 8; i++) bits += R[Number(c[i])];
    return bits + "101";
  }
  return null;
}

// ---- Scale labels: price- or weight-embedded EAN-13s (step 3.2) ----
// A labelling scale prints EAN-13s starting with 2: prefix, the product's PLU (item code), then
// either the price or the weight, then a check digit. Layouts differ between scales, so each
// business sets its own formats (Settings → Barcodes; restaurants.embedded_barcodes).

export interface EmbeddedFormat {
  prefix: string; // e.g. "21"
  itemDigits: number; // length of the PLU after the prefix
  value: "price" | "weight";
  decimals: number; // 2 for pounds.pence, 3 for kg with grams
}

export const DEFAULT_EMBEDDED_FORMATS: EmbeddedFormat[] = [
  { prefix: "21", itemDigits: 5, value: "price", decimals: 2 },
  { prefix: "22", itemDigits: 5, value: "weight", decimals: 3 },
];

export interface EmbeddedRead {
  plu: string;
  price?: number;
  weight?: number;
}

export function parseEmbedded(raw: string, formats: EmbeddedFormat[]): EmbeddedRead | null {
  const code = canonicalCode(raw);
  if (code.length !== 13 || !code.startsWith("2") || !isValidGtin(code)) return null;
  for (const f of formats) {
    if (!f.prefix || !code.startsWith(f.prefix)) continue;
    const start = f.prefix.length;
    const plu = code.slice(start, start + f.itemDigits);
    const valueDigits = code.slice(start + f.itemDigits, 12);
    if (!plu || !valueDigits || !/^\d+$/.test(valueDigits)) continue;
    const value = Number(valueDigits) / 10 ** f.decimals;
    return f.value === "price" ? { plu, price: value } : { plu, weight: value };
  }
  return null;
}

export function isEmbeddedFormat(v: unknown): v is EmbeddedFormat {
  const f = v as EmbeddedFormat;
  return (
    !!f &&
    /^2\d{0,2}$/.test(f.prefix) &&
    Number.isInteger(f.itemDigits) &&
    f.itemDigits >= 3 &&
    f.itemDigits <= 6 &&
    (f.value === "price" || f.value === "weight") &&
    Number.isInteger(f.decimals) &&
    f.decimals >= 0 &&
    f.decimals <= 3 &&
    f.prefix.length + f.itemDigits <= 9
  );
}
