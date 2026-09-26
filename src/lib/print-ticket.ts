"use client";

import QRCode from "qrcode";

export interface TicketData {
  orderNumber: string;
  tableNumber: number | null;
  channel: string;
  items: { name: string; qty: number; price: number; note?: string }[];
  subtotal: number;
  tax: number;
  donation: number;
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
        `<tr><td>${i.qty}x ${escapeHtml(i.name)}${i.note ? `<div class="note">↳ ${escapeHtml(i.note)}</div>` : ""}</td><td class="right">${money(i.price * i.qty)}</td></tr>`
    )
    .join("");

  const paymentRows = ticket.payments
    ?.map((p) => `<tr><td>Paid — ${escapeHtml(p.method)}</td><td class="right">${money(p.amount)}</td></tr>`)
    .join("");

  // QR points at the restaurant's website when one is set, otherwise falls back to a plain
  // vCard-style contact block so scanning the invoice is still useful without a website.
  const qrTarget =
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
  <div class="meta">Invoice #${escapeHtml(ticket.orderNumber)} &middot; ${escapeHtml(ticket.channel)}${
    ticket.tableNumber ? ` &middot; Table ${ticket.tableNumber}` : ""
  }</div>
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
  <table>
    <tr><td>Subtotal</td><td class="right">${money(ticket.subtotal)}</td></tr>
    <tr><td>Tax</td><td class="right">${money(ticket.tax)}</td></tr>
    ${ticket.donation > 0 ? `<tr><td>Donation</td><td class="right">${money(ticket.donation)}</td></tr>` : ""}
    <tr class="total"><td>Total</td><td class="right">${money(ticket.total)}</td></tr>
  </table>
  ${
    paymentRows
      ? `<hr /><table>${paymentRows}</table>`
      : ""
  }
  ${
    ticket.cashReceived
      ? `<hr /><table>
          <tr><td>Cash Received</td><td class="right">${money(ticket.cashReceived)}</td></tr>
          ${ticket.changeDue ? `<tr class="total"><td>Change Due</td><td class="right">${money(ticket.changeDue)}</td></tr>` : ""}
        </table>`
      : ""
  }
  ${qrDataUrl ? `<div class="qr-wrap"><img src="${qrDataUrl}" alt="QR code" /></div>` : ""}
  <div class="footer">${escapeHtml(ticket.invoiceFooterText)}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
