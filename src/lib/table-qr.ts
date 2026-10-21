"use client";

import QRCode from "qrcode";

// Encodes a URL as a scannable QR image — the invoice-share QR on the Till uses it as-is.
export async function tableOrderQrDataUrl(url: string) {
  return QRCode.toDataURL(url, { margin: 1, width: 240 }).catch(() => null);
}

// A print-ready table card (PNG data URL): restaurant name, a big "TABLE n", the QR for that
// table's signed ordering link, and a one-line instruction — so a sticker is self-explanatory
// and its table number is printed on it as well as fixed inside the QR. 800×1000px prints
// sharply at ~7×9cm.
export async function tableQrCardDataUrl({
  url,
  restaurantName,
  tableNumber,
  brandColor,
}: {
  url: string;
  restaurantName: string;
  tableNumber: number;
  brandColor: string;
}) {
  const W = 800;
  const H = 1000;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = brandColor;
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, W - 12, H - 12);

  ctx.textAlign = "center";
  ctx.fillStyle = "#171717";
  ctx.font = "600 42px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(restaurantName, W / 2, 92, W - 80);

  ctx.fillStyle = brandColor;
  ctx.font = "800 104px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText(`TABLE ${tableNumber}`, W / 2, 212, W - 80);

  const qr = document.createElement("canvas");
  try {
    await QRCode.toCanvas(qr, url, { width: 560, margin: 1, errorCorrectionLevel: "M" });
  } catch {
    return null;
  }
  ctx.drawImage(qr, (W - 560) / 2, 252, 560, 560);

  ctx.fillStyle = "#404040";
  ctx.font = "600 36px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("Scan to see the menu & order", W / 2, 880, W - 80);
  ctx.fillStyle = "#8a8a8a";
  ctx.font = "400 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
  ctx.fillText("No app or sign-in needed · pay at the counter", W / 2, 930, W - 80);

  return canvas.toDataURL("image/png");
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Opens every card on one printable page — "Save as PDF" from the print dialog gives a single
// file with all the table stickers, two per row.
export function printTableQrCards(cards: { tableNumber: number; dataUrl: string }[], title: string) {
  const win = window.open("", "_blank");
  if (!win) return false;
  const escapedTitle = title.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapedTitle}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { margin: 0; font-family: system-ui, sans-serif; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; }
  img { width: 100%; break-inside: avoid; page-break-inside: avoid; display: block; }
</style></head><body><div class="grid">${cards
    .map((c) => `<img src="${c.dataUrl}" alt="Table ${c.tableNumber}">`)
    .join("")}</div>
<script>window.onload = () => { window.focus(); window.print(); };</script></body></html>`);
  win.document.close();
  return true;
}
