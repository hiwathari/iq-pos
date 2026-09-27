"use client";

import QRCode from "qrcode";

// Renders a loyalty member's 7-character code as a scannable QR data URL — the same `qrcode`
// package already used for invoice QR codes in print-ticket.ts.
export async function loyaltyQrDataUrl(code: string) {
  return QRCode.toDataURL(code, { margin: 1, width: 240 }).catch(() => null);
}
