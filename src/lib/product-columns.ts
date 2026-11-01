// Spreadsheet columns for product import/export (docs/retail-plan step 2.5). Kept out of the
// "use server" action file, which may only export async functions.
export const IMPORT_COLUMNS = [
  "sku",
  "barcode",
  "barcode2",
  "name",
  "category",
  "sell_by",
  "unit",
  "price",
  "cost_price",
  "vat",
  "min_age",
  "track_stock",
  "stock",
  "low_stock",
  "brand",
  "description",
  "image_url",
] as const;

export type ImportRow = Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>;

// The template's two example rows — one sold by unit, one by weight.
export const TEMPLATE_ROWS: string[][] = [
  ["MILK-1L", "5000000000001", "", "Semi-skimmed Milk 1L", "Dairy & Eggs", "unit", "each", "1.15", "0.70", "", "", "yes", "24", "6", "", "", ""],
  ["BAN-LOOSE", "", "", "Bananas loose", "Fruit & Veg", "weight", "kg", "0.90", "0.55", "0", "", "yes", "12.5", "2", "", "", ""],
];
