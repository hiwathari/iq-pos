"use client";

import QRCode from "qrcode";

// Encodes a table's online-ordering URL (/order/<slug>?table=<n>) as a scannable QR — printed and
// stuck on the table so a phone camera lands the customer straight on that table's order.
export async function tableOrderQrDataUrl(url: string) {
  return QRCode.toDataURL(url, { margin: 1, width: 240 }).catch(() => null);
}
