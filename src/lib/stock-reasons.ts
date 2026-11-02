// Why stock is adjusted by hand (docs/retail-plan step 4.3). Plain module: used by the Stock
// screen and the server action. Damaged / out of date / theft / own use are "waste" movements
// (the Stock losses report adds them up at cost); a correction is a plain "adjust".
export const ADJUST_REASONS = [
  { label: "Damaged", kind: "waste" },
  { label: "Out of date", kind: "waste" },
  { label: "Theft / loss", kind: "waste" },
  { label: "Own use", kind: "waste" },
  { label: "Correction", kind: "adjust" },
  { label: "Other", kind: "adjust" },
] as const;

export type AdjustReason = (typeof ADJUST_REASONS)[number]["label"];

export const REASON_LABEL: Record<string, string> = {
  sale: "Sale",
  void: "Sale voided",
  edit: "Sale edited",
  refund: "Refund",
  received: "Goods in",
  adjust: "Adjustment",
  waste: "Waste / loss",
  count: "Stocktake",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  opening: "Opening stock",
};
