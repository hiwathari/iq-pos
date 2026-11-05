"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import type { Category, Dish } from "@/lib/types";
import { EanBarcode } from "@/components/ean-barcode";
import { markLabelsPrintedAction } from "@/lib/actions/menu";
import { priceLabel, unitPriceLabel } from "@/lib/units";
import { buildLabelJob, type LabelPrinterConfig, type LabelSpec } from "@/lib/label-printer";
import { printViaLocalBridge } from "@/lib/local-print-bridge";

// The single-item code, preferring the manufacturer's over the store's own "20…" one.
function pickCode(own: { code: string; packQty: number }[] | undefined) {
  const list = own ?? [];
  return (list.find((b) => b.packQty === 1 && !b.code.startsWith("20")) ?? list.find((b) => b.packQty === 1) ?? list[0])?.code;
}

// Shelf-edge labels and product stickers on A4 label sheets (docs/retail-plan step 2.6) — prints
// from any printer, no setup. Shelf labels carry the unit price (per 100 g / 100 ml / m) that UK
// price marking asks for on goods sold by weight or volume.
type Layout = { id: string; name: string; cols: number; rows: number; w: string; h: string; kind: "shelf" | "sticker" };
const LAYOUTS: Layout[] = [
  { id: "shelf21", name: "Shelf labels — 21 per A4 (63.5 × 38.1 mm)", cols: 3, rows: 7, w: "63.5mm", h: "38.1mm", kind: "shelf" },
  { id: "shelf8", name: "Large shelf labels — 8 per A4 (99.1 × 67.7 mm)", cols: 2, rows: 4, w: "99.1mm", h: "67.7mm", kind: "shelf" },
  { id: "sticker65", name: "Barcode stickers — 65 per A4 (38.1 × 21.2 mm)", cols: 5, rows: 13, w: "38.1mm", h: "21.2mm", kind: "sticker" },
];

export function LabelsClient({
  dishes,
  categories,
  barcodesByDish,
  currencySymbol,
  manageLabel,
  labelPrinter,
}: {
  dishes: Dish[];
  categories: Category[];
  barcodesByDish: Record<string, { code: string; packQty: number }[]>;
  currencySymbol: string;
  manageLabel: string;
  labelPrinter: LabelPrinterConfig | null;
}) {
  const [layoutId, setLayoutId] = useState("shelf21");
  const [category, setCategory] = useState("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [copies, setCopies] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const layout = LAYOUTS.find((l) => l.id === layoutId)!;

  const list = useMemo(
    () =>
      dishes
        .filter((d) => (category === "all" || d.categoryId === category) && (!onlyNew || !d.labelPrintedAt))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [dishes, category, onlyNew]
  );
  const chosen = dishes.filter((d) => picked.has(d.id));
  const labels = chosen.flatMap((d) => Array.from({ length: Math.max(1, copies) }, () => d));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function print() {
    window.print();
    await markLabelsPrintedAction(chosen.map((d) => d.id));
  }

  // Straight to the label printer (Settings → Label printer): one job, `copies` of each label.
  const [sent, setSent] = useState<{ ok: boolean; text: string } | null>(null);
  async function sendToPrinter() {
    if (!labelPrinter) return;
    const specs: LabelSpec[] = chosen.map((d) => {
      const barcode = pickCode(barcodesByDish[d.id]);
      const price = `${currencySymbol}${d.price.toFixed(2)}${d.sellBy !== "unit" ? ` / ${d.unit}` : ""}`;
      return layout.kind === "shelf"
        ? { kind: "shelf", name: d.name, price, unitPrice: d.sellBy !== "unit" ? unitPriceLabel(d.price, d.unit, currencySymbol) : null, barcode, copies: Math.max(1, copies) }
        : { kind: "sticker", name: d.name, price: priceLabel(d.price, d.sellBy, d.unit, currencySymbol), barcode, copies: Math.max(1, copies) };
    });
    try {
      await printViaLocalBridge({ printerIp: labelPrinter.ip, printerPort: labelPrinter.port, escposHex: buildLabelJob(specs, labelPrinter).hex });
      await markLabelsPrintedAction(chosen.map((d) => d.id));
      setSent({ ok: true, text: `Sent ${labels.length} label${labels.length === 1 ? "" : "s"} to the label printer.` });
    } catch {
      setSent({ ok: false, text: "Couldn't reach the print bridge on this device — install or start it (Settings → Printers), then try again." });
    }
  }

  return (
    <div className="p-6">
      <style>{`@media print { @page { size: A4; margin: 10mm 7mm; } body { background: #fff !important; } }`}</style>
      <div className="print:hidden">
        <Link href="/manage-dishes" className="mb-4 inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> {manageLabel}
        </Link>
        <h1 className="text-xl font-semibold text-neutral-900">Print labels</h1>
        <p className="mt-1 text-sm text-neutral-500">Tick the products, choose the label sheet in your printer, then Print. Check the printer is set to 100% / actual size.</p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-neutral-500">
            Label sheet
            <select value={layoutId} onChange={(e) => setLayoutId(e.target.value)} className="mt-1 block rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-neutral-800">
              {LAYOUTS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-500">
            Category
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 block rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-neutral-800">
              <option value="all">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-neutral-500">
            Copies each
            <input type="number" min={1} max={65} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(65, Number(e.target.value) || 1)))} className="mt-1 block w-24 rounded-xl border border-neutral-200 px-3 py-2.5 text-sm text-neutral-800" />
          </label>
          <label className="flex items-center gap-2 pb-2.5 text-sm text-neutral-600">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Never printed only
          </label>
          <button
            type="button"
            onClick={print}
            disabled={labels.length === 0}
            className="ml-auto flex items-center gap-2 rounded-xl bg-[var(--brand)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
          >
            <Printer className="h-4 w-4" /> Print {labels.length} label{labels.length === 1 ? "" : "s"}
          </button>
          {labelPrinter && (
            <button
              type="button"
              onClick={sendToPrinter}
              disabled={labels.length === 0}
              className="flex items-center gap-2 rounded-xl border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"
            >
              <Printer className="h-4 w-4" /> Send to label printer
            </button>
          )}
        </div>
        {sent && <p className={`mt-2 text-sm font-medium ${sent.ok ? "text-emerald-600" : "text-rose-600"}`}>{sent.text}</p>}

        <div className="mt-4 grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="max-h-[560px] overflow-auto rounded-xl border border-neutral-200 bg-white">
            <label className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700">
              <input
                type="checkbox"
                checked={list.length > 0 && list.every((d) => picked.has(d.id))}
                onChange={(e) => setPicked((prev) => {
                  const next = new Set(prev);
                  for (const d of list) {
                    if (e.target.checked) next.add(d.id);
                    else next.delete(d.id);
                  }
                  return next;
                })}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Select all ({list.length})
            </label>
            {list.map((d) => (
              <label key={d.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
                <input type="checkbox" checked={picked.has(d.id)} onChange={() => toggle(d.id)} className="h-4 w-4 accent-[var(--brand)]" />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="shrink-0 text-xs text-neutral-400">{priceLabel(d.price, d.sellBy, d.unit, currencySymbol)}</span>
              </label>
            ))}
          </div>
          <div className="overflow-auto rounded-xl border border-neutral-200 bg-neutral-100 p-4">
            <p className="mb-2 text-xs text-neutral-500">Preview</p>
            <Sheet labels={labels} layout={layout} barcodesByDish={barcodesByDish} currencySymbol={currencySymbol} />
          </div>
        </div>
      </div>
      <div className="hidden print:block">
        <Sheet labels={labels} layout={layout} barcodesByDish={barcodesByDish} currencySymbol={currencySymbol} />
      </div>
    </div>
  );
}

function Sheet({
  labels,
  layout,
  barcodesByDish,
  currencySymbol,
}: {
  labels: Dish[];
  layout: Layout;
  barcodesByDish: Record<string, { code: string; packQty: number }[]>;
  currencySymbol: string;
}) {
  return (
    <div className="grid w-fit bg-white" style={{ gridTemplateColumns: `repeat(${layout.cols}, ${layout.w})`, gridAutoRows: layout.h }}>
      {labels.map((d, i) => {
        // The single-item code, preferring the manufacturer's over the store's own "20…" one.
        const code = pickCode(barcodesByDish[d.id]);
        const unitPrice = d.sellBy !== "unit" ? unitPriceLabel(d.price, d.unit, currencySymbol) : null;
        return layout.kind === "shelf" ? (
          <div key={i} className="flex flex-col justify-between overflow-hidden border border-dashed border-neutral-300 p-[2.5mm] text-black print:border-transparent" style={{ breakInside: "avoid" }}>
            <div className="line-clamp-2 text-[10pt] font-semibold leading-tight">{d.name}</div>
            <div className="flex items-end justify-between gap-1">
              <div>
                <div className="text-[20pt] font-extrabold leading-none">
                  {currencySymbol}
                  {d.price.toFixed(2)}
                  {d.sellBy !== "unit" && <span className="text-[9pt] font-semibold"> / {d.unit}</span>}
                </div>
                {unitPrice && <div className="text-[7pt]">{unitPrice}</div>}
              </div>
              {code && <EanBarcode code={code} height={30} className="h-[11mm] w-[26mm] shrink-0" />}
            </div>
          </div>
        ) : (
          <div key={i} className="flex flex-col items-center justify-center overflow-hidden border border-dashed border-neutral-300 px-[1mm] text-black print:border-transparent" style={{ breakInside: "avoid" }}>
            <div className="w-full truncate text-center text-[6.5pt] font-semibold leading-tight">{d.name}</div>
            {code ? <EanBarcode code={code} height={30} className="h-[11mm] w-[30mm]" /> : <div className="text-[6pt]">no barcode</div>}
            <div className="text-[7pt] font-bold leading-none">{priceLabel(d.price, d.sellBy, d.unit, currencySymbol)}</div>
          </div>
        );
      })}
    </div>
  );
}
