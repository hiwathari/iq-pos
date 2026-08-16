"use client";

export interface TicketData {
  orderNumber: string;
  tableNumber: number | null;
  channel: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  tax: number;
  donation: number;
  total: number;
}

// Opens a small formatted ticket in a new window and triggers the browser's print dialog.
// This prints to whatever printer is registered at the OS level (including Bluetooth/
// network/WiFi thermal printers paired outside the browser) — a web page cannot pair
// hardware itself, but it can print to anything the OS already knows about.
export function printTicket(ticket: TicketData) {
  const win = window.open("", "_blank", "width=380,height=600");
  if (!win) return;

  const rows = ticket.items
    .map(
      (i) => `<tr><td>${i.qty}x ${escapeHtml(i.name)}</td><td class="right">$${(i.price * i.qty).toFixed(2)}</td></tr>`
    )
    .join("");

  win.document.write(`<!DOCTYPE html>
<html>
<head>
<title>Order #${escapeHtml(ticket.orderNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; width: 300px; margin: 0 auto; padding: 16px; color: #111; }
  h1 { font-size: 16px; text-align: center; margin: 0 0 4px; }
  .meta { text-align: center; font-size: 12px; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td { padding: 3px 0; }
  .right { text-align: right; }
  hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
  .total { font-weight: bold; font-size: 15px; }
  .footer { text-align: center; font-size: 11px; color: #777; margin-top: 12px; }
</style>
</head>
<body>
  <h1>IQ POS</h1>
  <div class="meta">Order #${escapeHtml(ticket.orderNumber)} &middot; ${escapeHtml(ticket.channel)}${
    ticket.tableNumber ? ` &middot; Table ${ticket.tableNumber}` : ""
  }</div>
  <hr />
  <table>${rows}</table>
  <hr />
  <table>
    <tr><td>Subtotal</td><td class="right">$${ticket.subtotal.toFixed(2)}</td></tr>
    <tr><td>Tax</td><td class="right">$${ticket.tax.toFixed(2)}</td></tr>
    ${ticket.donation > 0 ? `<tr><td>Donation</td><td class="right">$${ticket.donation.toFixed(2)}</td></tr>` : ""}
    <tr class="total"><td>Total</td><td class="right">$${ticket.total.toFixed(2)}</td></tr>
  </table>
  <div class="footer">Thank you!</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
