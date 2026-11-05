// Label printers (docs/retail-plan step 7.3). A direct-thermal label printer (Zebra and the many
// ZPL-compatible ones; TSC, Xprinter, Munbyn and other TSPL-compatible ones) takes a small text
// program over the same raw TCP port 9100 the receipt printers use, so the existing print bridge
// (lib/local-print-bridge.ts) carries it unchanged — this module only builds the program.
// Plain module, no server-only import: the labels pages build the job in the browser.
//
// Not covered: Brother QL and Dymo LabelWriter use their own raster protocols — print to those
// from the A4 / browser label pages with the printer's own driver.

export type LabelLanguage = "zpl" | "tspl";

export interface LabelPrinterConfig {
  ip: string;
  port: number | null;
  language: LabelLanguage;
  widthMm: number;
  heightMm: number;
  dpi: 203 | 300;
}

export type LabelSpec =
  | { kind: "shelf"; name: string; price: string; unitPrice?: string | null; barcode?: string | null; copies: number }
  | { kind: "sticker"; name: string; price: string; barcode?: string | null; copies: number }
  | { kind: "bin"; code: string; name?: string | null; copies: number };

export const DEFAULT_LABEL_PRINTER: LabelPrinterConfig = { ip: "", port: 9100, language: "zpl", widthMm: 50, heightMm: 30, dpi: 203 };

export function cleanLabelPrinter(input: unknown): LabelPrinterConfig | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const ip = String(v.ip ?? "").trim();
  if (!/^[0-9a-zA-Z.\-]{3,100}$/.test(ip)) return null;
  const language: LabelLanguage = v.language === "tspl" ? "tspl" : "zpl";
  const num = (x: unknown, min: number, max: number, fallback: number) => {
    const n = Number(x);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };
  return {
    ip,
    port: v.port == null || v.port === "" ? 9100 : num(v.port, 1, 65535, 9100),
    language,
    widthMm: num(v.widthMm, 20, 110, 50),
    heightMm: num(v.heightMm, 10, 200, 30),
    dpi: v.dpi === 300 ? 300 : 203,
  };
}

const isEan13 = (c?: string | null): c is string => !!c && /^\d{13}$/.test(c);
// ZPL field data must not contain the control characters ^ and ~.
const zplText = (s: string) => s.replace(/[\^~\\]/g, " ").slice(0, 80);
// TSPL strings are in double quotes.
const tsplText = (s: string) => s.replace(/["\\]/g, " ").slice(0, 80);

function zpl(l: LabelSpec, c: LabelPrinterConfig): string {
  const dot = (mm: number) => Math.round((mm * c.dpi) / 25.4);
  const W = dot(c.widthMm);
  const H = dot(c.heightMm);
  const m = dot(2);
  const inner = W - 2 * m;
  const out: string[] = [`^XA^CI28^PW${W}^LL${H}^LH0,0^LS0`];
  if (l.kind === "bin") {
    const qr = Math.max(2, Math.min(10, Math.floor(Math.min(H - 2 * m, inner) / 29)));
    out.push(`^FO${m},${m}^BQN,2,${qr}^FDQA,${zplText(l.code)}^FS`);
    const textX = m + qr * 29 + m;
    out.push(`^FO${textX},${m + dot(2)}^A0N,${dot(8)},${dot(8)}^FB${Math.max(10, W - textX - m)},2,0,L^FD${zplText(l.code)}^FS`);
    if (l.name) out.push(`^FO${textX},${m + dot(12)}^A0N,${dot(4)},${dot(4)}^FB${Math.max(10, W - textX - m)},2,0,L^FD${zplText(l.name)}^FS`);
  } else {
    const nameH = dot(l.kind === "shelf" ? 4 : 3.2);
    out.push(`^FO${m},${m}^A0N,${nameH},${nameH}^FB${inner},1,0,L^FD${zplText(l.name)}^FS`);
    const priceH = dot(l.kind === "shelf" ? 8 : 5);
    const priceY = m + nameH + dot(1);
    out.push(`^FO${m},${priceY}^A0N,${priceH},${priceH}^FD${zplText(l.price)}^FS`);
    let y = priceY + priceH + dot(1);
    if (l.kind === "shelf" && l.unitPrice) {
      out.push(`^FO${m},${y}^A0N,${dot(2.8)},${dot(2.8)}^FD${zplText(l.unitPrice)}^FS`);
      y += dot(3.2);
    }
    if (l.barcode) {
      const bh = Math.max(dot(6), H - y - m - dot(3));
      const mod = c.dpi === 300 ? 3 : 2;
      if (isEan13(l.barcode)) out.push(`^FO${m},${y}^BY${mod},3,${bh}^BEN,${bh},Y,N^FD${l.barcode}^FS`);
      else out.push(`^FO${m},${y}^BY${mod},3,${bh}^BCN,${bh},Y,N,N^FD${zplText(l.barcode)}^FS`);
    }
  }
  out.push(`^PQ${Math.max(1, Math.min(999, l.copies))}^XZ`);
  return out.join("\n");
}

function tspl(l: LabelSpec, c: LabelPrinterConfig): string {
  const dot = (mm: number) => Math.round((mm * c.dpi) / 25.4);
  const m = dot(2);
  const out: string[] = [`SIZE ${c.widthMm} mm,${c.heightMm} mm`, "GAP 2 mm,0 mm", "DIRECTION 1", "CODEPAGE 1252", "CLS"];
  if (l.kind === "bin") {
    const cell = Math.max(3, Math.min(10, Math.floor(Math.min(dot(c.heightMm) - 2 * m, dot(c.widthMm) / 2) / 29)));
    out.push(`QRCODE ${m},${m},M,${cell},A,0,"${tsplText(l.code)}"`);
    const tx = m + cell * 29 + m;
    out.push(`TEXT ${tx},${m + dot(2)},"4",0,1,1,"${tsplText(l.code)}"`);
    if (l.name) out.push(`TEXT ${tx},${m + dot(12)},"2",0,1,1,"${tsplText(l.name)}"`);
  } else {
    out.push(`TEXT ${m},${m},"2",0,1,1,"${tsplText(l.name)}"`);
    const bigY = m + dot(6);
    out.push(`TEXT ${m},${bigY},"${l.kind === "shelf" ? "5" : "3"}",0,1,1,"${tsplText(l.price)}"`);
    let y = bigY + dot(l.kind === "shelf" ? 10 : 6);
    if (l.kind === "shelf" && l.unitPrice) {
      out.push(`TEXT ${m},${y},"1",0,1,1,"${tsplText(l.unitPrice)}"`);
      y += dot(3.6);
    }
    if (l.barcode) {
      const bh = Math.max(dot(6), dot(c.heightMm) - y - m - dot(3));
      out.push(`BARCODE ${m},${y},"${isEan13(l.barcode) ? "EAN13" : "128"}",${bh},1,0,2,4,"${tsplText(l.barcode)}"`);
    }
  }
  out.push(`PRINT ${Math.max(1, Math.min(999, l.copies))},1`);
  return out.join("\r\n");
}

// The whole job for these labels, as bytes (hex-encoded for the print bridge).
export function buildLabelJob(labels: LabelSpec[], config: LabelPrinterConfig): { text: string; hex: string } {
  const text = labels.map((l) => (config.language === "tspl" ? tspl(l, config) : zpl(l, config))).join("\r\n") + "\r\n";
  // ZPL is told to expect UTF-8 (^CI28); TSPL gets Windows-1252 so £ prints (£ is byte 0xA3 in
  // both Latin-1 and Windows-1252; anything beyond one byte becomes "?").
  const bytes: number[] = config.language === "tspl" ? Array.from(text, (ch) => (ch.charCodeAt(0) < 256 ? ch.charCodeAt(0) : 0x3f)) : Array.from(new TextEncoder().encode(text));
  return { text, hex: bytes.map((b) => b.toString(16).padStart(2, "0")).join("") };
}

// A one-label test, so the settings page can check the connection and the size.
export function testLabel(): LabelSpec {
  return { kind: "shelf", name: "IQ POS test label", price: "£1.99", unitPrice: "£0.20 per 100 g", barcode: "5000112637939", copies: 1 };
}
