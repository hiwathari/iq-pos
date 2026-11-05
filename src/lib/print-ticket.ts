"use client";

import QRCode from "qrcode";
import { lineTotal } from "@/lib/types";
import { receiptLine } from "@/lib/units";
import { eanModules } from "@/lib/barcode";

export interface TicketData {
  orderNumber: string;
  createdAt: number;
  tableNumber: number | null;
  channel: string;
  items: { name: string; qty: number; price: number; note?: string; sellBy?: string; unit?: string; fixedTotal?: number; promo?: { name: string; saving: number }; serials?: string[] }[];
  subtotal: number;
  extraDiscount?: number;
  couponCode?: string;
  couponDiscount?: number;
  tax: number;
  total: number;
  currencySymbol: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  payments?: { method: string; amount: number }[];
  cashReceived?: number;
  changeDue?: number;
  restaurantName: string;
  invoiceAddress?: string;
  invoicePhone?: string;
  invoiceWebsite?: string;
  invoiceLogoUrl?: string;
  invoiceFooterText: string;
  // The order's public /invoice/[id] link, when one exists (i.e. the order has been saved) —
  // QR-encoded on the printed receipt so the customer can scan it to get their own shareable,
  // downloadable copy instead of keeping the paper slip.
  invoiceUrl?: string;
  // A gift receipt (step 5.4): what was bought, without any prices, totals or payments.
  gift?: boolean;
}

// Opens a small formatted invoice in a new window and triggers the browser's print dialog.
// This prints to whatever printer is registered at the OS level (including Bluetooth/
// network/WiFi thermal printers paired outside the browser) — a web page cannot pair
// hardware itself, but it can print to anything the OS already knows about.
export async function printTicket(ticket: TicketData) {
  const win = window.open("", "_blank", "width=380,height=700");
  if (!win) return;

  const money = (amount: number) => `${ticket.currencySymbol}${amount.toFixed(2)}`;

  const rows = ticket.items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(receiptLine(i, ticket.currencySymbol)[0])}${!ticket.gift && receiptLine(i, ticket.currencySymbol)[1] ? `<div class="note">${escapeHtml(receiptLine(i, ticket.currencySymbol)[1]!)}</div>` : ""}${i.serials?.length ? `<div class="note">S/N ${escapeHtml(i.serials.join(", "))}</div>` : ""}${!ticket.gift && i.promo ? `<div class="note">${escapeHtml(i.promo.name)} −${money(i.promo.saving)}</div>` : ""}${i.note ? `<div class="note">↳ ${escapeHtml(i.note)}</div>` : ""}</td>${ticket.gift ? "" : `<td class="right">${money(lineTotal(i))}</td>`}</tr>`
    )
    .join("");

  const paymentRows = ticket.payments
    ?.map((p) => `<tr><td>Paid — ${escapeHtml(p.method)}</td><td class="right">${money(p.amount)}</td></tr>`)
    .join("");

  // QR prefers the order's own shareable invoice link (customer scans it to get a downloadable
  // copy), falling back to the restaurant's website, then a plain vCard-style contact block, so
  // scanning is still useful for a not-yet-saved order or a restaurant with no website.
  const qrTarget =
    ticket.invoiceUrl ||
    ticket.invoiceWebsite ||
    (ticket.invoicePhone ? `TEL:${ticket.invoicePhone}` : null);
  const qrDataUrl = qrTarget
    ? await QRCode.toDataURL(qrTarget, { margin: 1, width: 120 }).catch(() => null)
    : null;

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Invoice #${escapeHtml(ticket.orderNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; width: 300px; margin: 0 auto; padding: 16px; color: #111; }
  .logo { display: block; max-width: 140px; max-height: 70px; margin: 0 auto 8px; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
  .restaurant-meta { text-align: center; font-size: 11px; color: #555; line-height: 1.5; margin-bottom: 10px; }
  .meta { text-align: center; font-size: 12px; color: #555; margin-bottom: 12px; }
  .customer { text-align: center; font-size: 12px; color: #333; margin-bottom: 10px; line-height: 1.4; }
  .note { font-size: 11px; font-style: italic; color: #555; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 3px 0; }
  .right { text-align: right; }
  hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
  .total { font-weight: bold; font-size: 15px; }
  .qr-wrap { text-align: center; margin-top: 14px; }
  .qr-wrap img { width: 100px; height: 100px; }
  .qr-caption { font-size: 10px; color: #777; margin-top: 3px; }
  .footer { text-align: center; font-size: 11px; color: #777; margin-top: 10px; white-space: pre-wrap; }
</style>
</head>
<body>
  ${ticket.invoiceLogoUrl ? `<img class="logo" src="${escapeHtml(ticket.invoiceLogoUrl)}" alt="" />` : ""}
  <h1>${escapeHtml(ticket.restaurantName)}</h1>
  ${
    ticket.invoiceAddress || ticket.invoicePhone || ticket.invoiceWebsite
      ? `<div class="restaurant-meta">
          ${ticket.invoiceAddress ? `<div>${escapeHtml(ticket.invoiceAddress)}</div>` : ""}
          ${ticket.invoicePhone ? `<div>${escapeHtml(ticket.invoicePhone)}</div>` : ""}
          ${ticket.invoiceWebsite ? `<div>${escapeHtml(ticket.invoiceWebsite)}</div>` : ""}
        </div>`
      : ""
  }
  ${ticket.gift ? `<div class="meta"><strong style="font-size:16px;letter-spacing:1px">GIFT RECEIPT</strong></div>` : ""}<div class="meta">${ticket.gift ? "Order" : "Invoice"} #${escapeHtml(ticket.orderNumber)} &middot; ${escapeHtml(
    new Date(ticket.createdAt).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
  )}<br/>${escapeHtml(ticket.channel)}${ticket.tableNumber ? ` &middot; Table ${ticket.tableNumber}` : ""}</div>
  ${
    ticket.customerName || ticket.customerPhone || ticket.customerAddress
      ? `<div class="customer">
          ${ticket.customerName ? `<div><strong>${escapeHtml(ticket.customerName)}</strong></div>` : ""}
          ${ticket.customerPhone ? `<div>${escapeHtml(ticket.customerPhone)}</div>` : ""}
          ${ticket.customerAddress ? `<div>${escapeHtml(ticket.customerAddress)}</div>` : ""}
        </div>`
      : ""
  }
  <hr />
  <table>${rows}</table>
  <hr />
  ${ticket.gift ? `<div class="footer">Please keep this receipt for exchanges.</div>` : `<table>
    <tr><td>Subtotal</td><td class="right">${money(ticket.subtotal)}</td></tr>
    ${ticket.extraDiscount ? `<tr><td>Extra Discount</td><td class="right">-${money(ticket.extraDiscount)}</td></tr>` : ""}
    ${ticket.couponDiscount ? `<tr><td>Coupon${ticket.couponCode ? ` (${escapeHtml(ticket.couponCode)})` : ""}</td><td class="right">-${money(ticket.couponDiscount)}</td></tr>` : ""}
    <tr><td>Tax</td><td class="right">${money(ticket.tax)}</td></tr>
    <tr class="total"><td>Total</td><td class="right">${money(ticket.total)}</td></tr>
  </table>`}
  ${
    paymentRows && !ticket.gift
      ? `<hr /><table>${paymentRows}</table>`
      : ""
  }
  ${
    ticket.cashReceived && !ticket.gift
      ? `<hr /><table>
          <tr><td>Cash Received</td><td class="right">${money(ticket.cashReceived)}</td></tr>
          ${ticket.changeDue ? `<tr class="total"><td>Change Due</td><td class="right">${money(ticket.changeDue)}</td></tr>` : ""}
        </table>`
      : ""
  }
  ${
    qrDataUrl && !ticket.gift
      ? `<div class="qr-wrap"><img src="${qrDataUrl}" alt="QR code" />${
          ticket.invoiceUrl ? `<div class="qr-caption">Scan for a digital copy</div>` : ""
        }</div>`
      : ""
  }
  <div class="footer">${escapeHtml(ticket.invoiceFooterText)}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}

// A store-credit slip's EAN-13 as inline SVG (the print window has no React).
function creditBarcodeSvg(code: string) {
  const bits = eanModules(code);
  if (!bits) return `<div>${escapeHtml(code)}</div>`;
  const quiet = 9;
  const bars = [...bits].map((b, i) => (b === "1" ? `<rect x="${quiet + i}" y="0" width="1" height="46" fill="#000"/>` : "")).join("");
  return `<svg viewBox="0 0 ${bits.length + quiet * 2} 56" width="240" height="64" preserveAspectRatio="none"><rect width="100%" height="56" fill="#fff"/>${bars}<text x="${(bits.length + quiet * 2) / 2}" y="54" text-anchor="middle" font-size="7" font-family="monospace">${escapeHtml(code)}</text></svg>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// A refund slip (docs/retail-plan step 3.7): what was refunded, how, and against which sale —
// printed through the browser like the receipt above.
export function printRefundSlip(r: {
  restaurantName: string;
  number: string;
  orderNumber: string;
  createdAt: number;
  method: string;
  amount: number;
  reason?: string;
  staffName?: string;
  lines: { name: string; qty: number; amount: number; sellBy?: string; unit?: string }[];
  currencySymbol: string;
  // Refund given as store credit (step 5.5): the slip carries the credit's barcode.
  credit?: { code: string; amount: number };
}) {
  const win = window.open("", "_blank", "width=380,height=600");
  if (!win) return;
  const money = (n: number) => `${r.currencySymbol}${n.toFixed(2)}`;
  const rows = r.lines
    .map((l) => `<tr><td>${escapeHtml(receiptLine({ ...l, price: 0 }, r.currencySymbol)[0])}${l.sellBy && l.sellBy !== "unit" ? ` <span class="note">${l.qty} ${escapeHtml(l.unit ?? "")}</span>` : ""}</td><td class="right">-${money(l.amount)}</td></tr>`)
    .join("");
  win.document.write(`<!doctype html><html><head><title>Refund ${escapeHtml(r.number)}</title><style>
    body{font-family:ui-monospace,Menlo,monospace;font-size:12px;width:72mm;margin:0 auto;padding:8px;color:#000}
    h1{font-size:15px;text-align:center;margin:4px 0} .c{text-align:center} table{width:100%;border-collapse:collapse}
    td{padding:2px 0;vertical-align:top} .right{text-align:right;white-space:nowrap} .note{font-size:11px}
    hr{border:0;border-top:1px dashed #000;margin:6px 0} .tot td{font-weight:bold;font-size:14px}
  </style></head><body>
    <h1>${escapeHtml(r.restaurantName)}</h1>
    <div class="c"><b>REFUND ${escapeHtml(r.number)}</b><br/>for sale #${escapeHtml(r.orderNumber)}<br/>${new Date(r.createdAt).toLocaleString("en-GB")}</div>
    <hr/><table>${rows}</table><hr/>
    <table><tr class="tot"><td>Refunded</td><td class="right">-${money(r.amount)}</td></tr>
    <tr><td>To</td><td class="right">${escapeHtml(r.method)}</td></tr></table>
    ${
      r.credit
        ? `<hr/><div class="c"><b>STORE CREDIT ${money(r.credit.amount)}</b><br/>${creditBarcodeSvg(r.credit.code)}<div class="note">Scan at the till to pay with it</div></div>`
        : ""
    }
    ${r.reason ? `<div class="note">Reason: ${escapeHtml(r.reason)}</div>` : ""}
    ${r.staffName ? `<div class="note">Served by ${escapeHtml(r.staffName)}</div>` : ""}
    <hr/><div class="c note">Keep this slip with your receipt.</div>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300)}</script>
  </body></html>`);
  win.document.close();
}

// A delivery note (docs/retail-plan step 6.4): what is in the parcel, who it is for, and a box to
// sign — no prices. Printed from the Picking screen.
export function printDeliveryNote(d: {
  business: { name: string; address: string | null; phone: string | null };
  order: {
    orderNumber: string;
    createdAt: number;
    channel: string;
    customerName: string | null;
    customerPhone: string | null;
    customerAddress: string | null;
    lines: { name: string; qty: number; unit?: string; sellBy?: string; serials?: string[]; short: boolean }[];
  };
}) {
  const win = window.open("", "_blank", "width=720,height=900");
  if (!win) return;
  const rows = d.order.lines
    .map((l) => `<tr><td>${escapeHtml(l.name)}${l.serials?.length ? `<div class="note">S/N ${escapeHtml(l.serials.join(", "))}</div>` : ""}${l.short ? `<div class="note"><b>Short — not all supplied</b></div>` : ""}</td><td class="right">${l.qty}${l.sellBy && l.sellBy !== "unit" ? ` ${escapeHtml(l.unit ?? "")}` : ""}</td></tr>`)
    .join("");
  win.document.write(`<!doctype html><html><head><title>Delivery note ${escapeHtml(d.order.orderNumber)}</title><style>
    body{font-family:system-ui,sans-serif;font-size:13px;margin:28px;color:#111} h1{font-size:20px;margin:0 0 2px} .muted{color:#666}
    table{width:100%;border-collapse:collapse;margin-top:14px} th,td{border-bottom:1px solid #ddd;padding:7px 4px;text-align:left;vertical-align:top} .right{text-align:right}
    .note{font-size:11px;color:#555} .grid{display:flex;justify-content:space-between;gap:24px;margin-top:12px} .sig{margin-top:40px;border-top:1px solid #000;width:260px;padding-top:4px;font-size:12px}
  </style></head><body>
    <h1>Delivery note</h1><div class="muted">${escapeHtml(d.business.name)}${d.business.address ? ` · ${escapeHtml(d.business.address)}` : ""}${d.business.phone ? ` · ${escapeHtml(d.business.phone)}` : ""}</div>
    <div class="grid"><div><b>Deliver to</b><br/>${escapeHtml(d.order.customerName ?? "")}<br/>${escapeHtml(d.order.customerAddress ?? "")}<br/>${escapeHtml(d.order.customerPhone ?? "")}</div>
    <div class="right"><b>Order #${escapeHtml(d.order.orderNumber)}</b><br/>${new Date(d.order.createdAt).toLocaleDateString("en-GB")}<br/>${escapeHtml(d.order.channel)}</div></div>
    <table><thead><tr><th>Item</th><th class="right">Quantity</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="sig">Received by (signature) &nbsp; Date</div>
    <script>window.onload=()=>{window.print()}</script>
  </body></html>`);
  win.document.close();
}
