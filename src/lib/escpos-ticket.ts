import "server-only";

// Builds the raw ESC/POS command bytes for a Sunmi Cloud Print ticket, hex-encoded exactly as
// Sunmi's callback API expects (see lib/sunmi-print.ts and docs/DEVELOPER_GUIDE.md §8.3). This is
// a completely separate code path from lib/print-ticket.ts, which generates an HTML page for the
// browser's own print dialog — that one is untouched and still the default for every printer that
// doesn't have a Sunmi SN set.
//
// ⚠️ UNVERIFIED against a real device: these are standard ESC/POS commands any thermal printer
// should honor, but this hasn't been tested on an actual Sunmi printer yet. Use the "Send Test
// Print" button in Settings → Printers once a printer's SN is saved to confirm formatting/cut
// behavior before relying on this for real tickets.
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// Most Sunmi handheld/cloud printer models are 58mm paper, ~32 characters per line at the default
// font — wider 80mm models (48 chars) would need this bumped; there's no per-printer paper-width
// setting in this app yet to drive it automatically.
const LINE_WIDTH = 32;

function initPrinter(): number[] {
  return [ESC, 0x40];
}
function setAlign(n: 0 | 1 | 2): number[] {
  return [ESC, 0x61, n]; // 0 = left, 1 = center, 2 = right
}
function setMode(n: number): number[] {
  return [ESC, 0x21, n]; // 0x00 = normal, 0x08 = bold, 0x30 = double width + height
}
function cutPaper(): number[] {
  return [GS, 0x56, 0x00]; // full cut
}
function feed(lines = 1): number[] {
  return Array(lines).fill(LF);
}
function textBytes(s: string): number[] {
  return Array.from(Buffer.from(s, "utf8"));
}

function moneyRow(label: string, amount: string): string {
  const truncatedLabel = label.length > LINE_WIDTH - amount.length - 1 ? label.slice(0, LINE_WIDTH - amount.length - 2) + "…" : label;
  const pad = Math.max(1, LINE_WIDTH - truncatedLabel.length - amount.length);
  return truncatedLabel + " ".repeat(pad) + amount;
}

export interface SunmiTicketItem {
  name: string;
  qty: number;
  price: number;
  note?: string;
}

export interface SunmiTicketData {
  restaurantName: string;
  orderNumber: string;
  createdAt: number;
  tableNumber: number | null;
  channel: string;
  items: SunmiTicketItem[];
  subtotal: number;
  extraDiscount?: number;
  couponDiscount?: number;
  tax: number;
  total: number;
  currencySymbol: string;
  payments?: { method: string; amount: number }[];
  footerText: string;
}

// Returns both the hex-encoded ESC/POS payload (what Sunmi's callback API hands the printer) and
// a short plain-text line for the printer's optional voice announcement.
export function buildEscPosTicket(t: SunmiTicketData): { hex: string; voice: string } {
  const money = (n: number) => `${t.currencySymbol}${n.toFixed(2)}`;
  const divider = "-".repeat(LINE_WIDTH);
  const bytes: number[] = [];

  bytes.push(...initPrinter());
  bytes.push(...setAlign(1), ...setMode(0x30), ...textBytes(t.restaurantName), ...feed());
  bytes.push(...setMode(0x00));
  bytes.push(...textBytes(`Order #${t.orderNumber}`), ...feed());
  bytes.push(...textBytes(new Date(t.createdAt).toLocaleString()), ...feed());
  bytes.push(...textBytes(t.channel + (t.tableNumber ? ` · Table ${t.tableNumber}` : "")), ...feed(2));

  bytes.push(...setAlign(0));
  bytes.push(...textBytes(divider), ...feed());
  for (const item of t.items) {
    bytes.push(...textBytes(moneyRow(`${item.qty}x ${item.name}`, money(item.price * item.qty))), ...feed());
    if (item.note) bytes.push(...textBytes(`  > ${item.note}`), ...feed());
  }
  bytes.push(...textBytes(divider), ...feed());

  bytes.push(...textBytes(moneyRow("Subtotal", money(t.subtotal))), ...feed());
  if (t.extraDiscount) bytes.push(...textBytes(moneyRow("Discount", `-${money(t.extraDiscount)}`)), ...feed());
  if (t.couponDiscount) bytes.push(...textBytes(moneyRow("Coupon", `-${money(t.couponDiscount)}`)), ...feed());
  if (t.tax) bytes.push(...textBytes(moneyRow("Tax", money(t.tax))), ...feed());
  bytes.push(...setMode(0x08));
  bytes.push(...textBytes(moneyRow("TOTAL", money(t.total))), ...feed());
  bytes.push(...setMode(0x00));

  if (t.payments?.length) {
    bytes.push(...textBytes(divider), ...feed());
    for (const p of t.payments) bytes.push(...textBytes(moneyRow(`Paid - ${p.method}`, money(p.amount))), ...feed());
  }

  bytes.push(...feed());
  bytes.push(...setAlign(1));
  bytes.push(...textBytes(t.footerText), ...feed(3));
  bytes.push(...cutPaper());

  return { hex: Buffer.from(bytes).toString("hex"), voice: `New order ${t.orderNumber}` };
}
