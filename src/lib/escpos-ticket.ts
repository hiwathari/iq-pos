import "server-only";
import sharp from "sharp";

// Builds the raw ESC/POS command bytes for a Sunmi/thermal receipt, hex-encoded exactly as the
// local print bridge expects (see lib/local-print-bridge.ts, src/app/android-app and
// docs/DEVELOPER_GUIDE.md §7.8/§7.9). Completely separate from lib/print-ticket.ts, which
// generates an HTML page for the browser's own print dialog.
//
// ⚠️ UNVERIFIED pieces, flagged individually below: the logo raster and the QR code block use
// standard, widely-supported ESC/POS command sequences, but neither has been confirmed against a
// real printer yet — test with Settings → Printers → Test Print before relying on them for real
// tickets.
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

// 80mm paper, ~48 characters per line at the default (Font A) size — the standard column count
// for 80mm thermal printers (as opposed to the 32-column default this used when it was written
// for a narrower 58mm assumption). If a specific printer's default font renders narrower/wider,
// adjust this and nothing else needs to change.
const LINE_WIDTH = 48;

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
function hr(): number[] {
  return [...textBytes("-".repeat(LINE_WIDTH)), ...feed()];
}

function moneyRow(label: string, amount: string, bold = false): number[] {
  const truncatedLabel = label.length > LINE_WIDTH - amount.length - 1 ? label.slice(0, LINE_WIDTH - amount.length - 2) + "…" : label;
  const pad = Math.max(1, LINE_WIDTH - truncatedLabel.length - amount.length);
  const row = truncatedLabel + " ".repeat(pad) + amount;
  return bold ? [...setMode(0x08), ...textBytes(row), ...setMode(0x00), ...feed()] : [...textBytes(row), ...feed()];
}

// GS ( k — the standard "function 165" command family used for both the QR code block below and
// (implicitly, via GS v 0 instead) the logo raster. Written out explicitly per Epson's documented
// ESC/POS command reference, which nearly every thermal printer's firmware follows.
function gsK(cn: number, fn: number, params: number[]): number[] {
  const pL = (params.length + 2) & 0xff;
  const pH = ((params.length + 2) >> 8) & 0xff;
  return [GS, 0x28, 0x6b, pL, pH, cn, fn, ...params];
}

// ⚠️ UNVERIFIED: standard ESC/POS QR block (model 2, configurable module size/error correction,
// store, then print) — this exact sequence is what most ESC/POS-compatible printers (Epson,
// Sunmi included per their own documented command set) implement, but hasn't been confirmed on
// the actual NT311 yet.
function qrCommands(data: string, moduleSize = 6): number[] {
  const bytes: number[] = [];
  bytes.push(...gsK(0x31, 0x41, [0x32, 0x00])); // select model 2
  bytes.push(...gsK(0x31, 0x43, [moduleSize])); // module size (dots per module)
  bytes.push(...gsK(0x31, 0x45, [0x31])); // error correction level M
  const dataBytes = textBytes(data);
  bytes.push(...gsK(0x31, 0x50, [0x30, ...dataBytes])); // store data (m=0x30 fixed)
  bytes.push(...gsK(0x31, 0x51, [0x30])); // print the stored symbol
  return bytes;
}

// ⚠️ UNVERIFIED: fetches the restaurant's logo image and renders it as an ESC/POS raster bit
// image (GS v 0). Resized to a fixed width (384 dots — a conservative size most printers' raster
// buffers handle comfortably; bump it if a specific printer supports more and a crisper logo is
// wanted), converted to 1-bit black/white by simple thresholding (no dithering — a logo with
// fine gradients may look blocky; a flat/high-contrast logo prints best). Returns null (prints
// nothing, never throws) if the image can't be fetched or decoded, so a bad logo URL degrades
// gracefully instead of blocking the whole ticket.
async function renderLogoRaster(logoUrl: string, widthDots = 384): Promise<number[] | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const input = Buffer.from(await res.arrayBuffer());
    const rowBytesTarget = Math.ceil(widthDots / 8);
    const alignedWidth = rowBytesTarget * 8;
    const { data, info } = await sharp(input)
      .resize({ width: alignedWidth })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const { width, height } = info;
    const rowBytes = Math.ceil(width / 8);
    const bitmap = new Uint8Array(rowBytes * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const gray = data[y * width + x];
        if (gray < 160) {
          bitmap[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
        }
      }
    }
    const xL = rowBytes & 0xff;
    const xH = (rowBytes >> 8) & 0xff;
    const yL = height & 0xff;
    const yH = (height >> 8) & 0xff;
    return [GS, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...Array.from(bitmap)];
  } catch {
    return null;
  }
}

export interface SunmiTicketItem {
  name: string;
  qty: number;
  price: number;
  note?: string;
}

// Items grouped by their menu category, in the order they should print — built by the caller
// (order-line-client.tsx and the Settings Test Print button both already have categories/dishes
// loaded) rather than here, so this module stays decoupled from menu data.
export interface SunmiTicketCategoryGroup {
  categoryName: string;
  items: SunmiTicketItem[];
}

export interface SunmiTicketData {
  restaurantName: string;
  invoiceLogoUrl?: string;
  invoiceAddress?: string;
  invoicePhone?: string;
  invoiceEmail?: string;
  invoiceWebsite?: string;
  orderNumber: string;
  createdAt: number;
  channel: string;
  tableNumber: number | null;
  guests: number | null;
  staffName?: string;
  items: SunmiTicketCategoryGroup[];
  // Shown near the bottom for Delivery/Take Away orders — whichever of these are present.
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  subtotal: number;
  extraDiscount?: number;
  couponCode?: string;
  couponDiscount?: number;
  tax: number;
  total: number;
  currencySymbol: string;
  payments?: { method: string; amount: number }[];
  footerText: string;
  // The order's public /invoice/[id] link — QR-encoded at the bottom so the customer can scan
  // for a digital copy. Omitted entirely (no QR block) when the order hasn't been saved yet.
  invoiceUrl?: string;
}

export async function buildEscPosTicket(t: SunmiTicketData): Promise<{ hex: string; voice: string }> {
  const money = (n: number) => `${t.currencySymbol}${n.toFixed(2)}`;
  const bytes: number[] = [];

  bytes.push(...initPrinter());

  // --- Header: logo (mandatory when one's configured), name, contact details ---
  bytes.push(...setAlign(1));
  if (t.invoiceLogoUrl) {
    const logo = await renderLogoRaster(t.invoiceLogoUrl);
    if (logo) {
      bytes.push(...logo, ...feed());
    } else {
      // Logo fetch/decode failed — fall back to the restaurant name in large text so the header
      // is never blank, rather than silently skipping it.
      bytes.push(...setMode(0x30), ...textBytes(t.restaurantName), ...setMode(0x00), ...feed());
    }
  } else {
    bytes.push(...setMode(0x30), ...textBytes(t.restaurantName), ...setMode(0x00), ...feed());
  }
  if (t.invoiceAddress) bytes.push(...textBytes(t.invoiceAddress), ...feed());
  const contactLine = [t.invoicePhone, t.invoiceEmail, t.invoiceWebsite].filter(Boolean).join(" | ");
  if (contactLine) bytes.push(...textBytes(contactLine), ...feed());
  bytes.push(...feed());

  // --- Order meta: id, date/time, channel, table/guests, server ---
  bytes.push(...setAlign(0));
  bytes.push(...hr());
  bytes.push(...setMode(0x08), ...textBytes(`Order #${t.orderNumber}`), ...setMode(0x00), ...feed());
  const created = new Date(t.createdAt);
  bytes.push(
    ...textBytes(
      created.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) +
        "  " +
        created.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    ),
    ...feed()
  );
  const channelLine =
    t.channel + (t.tableNumber ? ` · Table ${t.tableNumber}${t.guests ? ` · ${t.guests} Guest${t.guests === 1 ? "" : "s"}` : ""}` : "");
  bytes.push(...textBytes(channelLine), ...feed());
  if (t.staffName) bytes.push(...textBytes(`Server: ${t.staffName}`), ...feed());
  bytes.push(...hr());

  // --- Items, grouped by category ---
  for (const group of t.items) {
    if (group.items.length === 0) continue;
    bytes.push(...setMode(0x08), ...textBytes(group.categoryName.toUpperCase()), ...setMode(0x00), ...feed());
    for (const item of group.items) {
      bytes.push(...moneyRow(`${item.qty}x ${item.name}`, money(item.price * item.qty)));
      if (item.note) bytes.push(...textBytes(`  > ${item.note}`), ...feed());
    }
  }
  bytes.push(...hr());

  // --- Delivery/customer info, shown at the bottom (not inline with items) ---
  if (t.channel === "Delivery" || t.channel === "Take Away") {
    if (t.customerName || t.customerPhone || t.customerAddress) {
      bytes.push(...setMode(0x08), ...textBytes(`${t.channel} Details`), ...setMode(0x00), ...feed());
      if (t.customerName) bytes.push(...textBytes(t.customerName), ...feed());
      if (t.customerPhone) bytes.push(...textBytes(t.customerPhone), ...feed());
      if (t.customerAddress) bytes.push(...textBytes(t.customerAddress), ...feed());
      bytes.push(...hr());
    }
  }

  // --- Totals ---
  bytes.push(...moneyRow("Subtotal", money(t.subtotal)));
  if (t.extraDiscount) bytes.push(...moneyRow("Discount", `-${money(t.extraDiscount)}`));
  if (t.couponDiscount) bytes.push(...moneyRow(`Coupon${t.couponCode ? ` (${t.couponCode})` : ""}`, `-${money(t.couponDiscount)}`));
  if (t.tax) bytes.push(...moneyRow("Tax", money(t.tax)));
  bytes.push(...hr());
  // Total payable — bold, per the restaurant's requirement.
  bytes.push(...moneyRow("TOTAL PAYABLE", money(t.total), true));

  if (t.payments?.length) {
    bytes.push(...feed());
    for (const p of t.payments) bytes.push(...moneyRow(`Paid - ${p.method}`, money(p.amount)));
  }

  // --- Footer: thank-you text, QR code to the digital receipt ---
  bytes.push(...feed());
  bytes.push(...setAlign(1));
  bytes.push(...textBytes(t.footerText), ...feed(2));
  if (t.invoiceUrl) {
    bytes.push(...qrCommands(t.invoiceUrl), ...feed());
    bytes.push(...textBytes("Scan for your digital receipt"), ...feed());
    bytes.push(...textBytes("Link valid for 1 week"), ...feed());
  }
  bytes.push(...feed(2));
  bytes.push(...cutPaper());

  return { hex: Buffer.from(bytes).toString("hex"), voice: `New order ${t.orderNumber}` };
}
