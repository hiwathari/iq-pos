"use client";

import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import { canonicalCode } from "@/lib/barcode";

// Find a stock item by name, SKU or barcode — shared by Goods in, purchase orders and Stocktake.
// A scanner works anywhere on the page (and in the box); a case barcode reports its pack size so
// one scan can add 12.
export interface PickItem {
  id: string;
  name: string;
  unit: string;
  sku?: string | null;
  costPrice?: number | null;
  supplierId?: string | null;
  trackSerials?: boolean;
  barcodes?: { code: string; packQty: number }[];
}

export function matchCode<T extends PickItem>(items: T[], raw: string): { item: T; packQty: number } | null {
  const code = canonicalCode(raw);
  for (const item of items) {
    const hit = item.barcodes?.find((b) => b.code === code);
    if (hit) return { item, packQty: hit.packQty };
  }
  return null;
}

export function StockItemPicker<T extends PickItem>({
  items,
  onPick,
  placeholder = "Scan a barcode or search by name / SKU",
  autoFocus = false,
}: {
  items: T[];
  onPick: (item: T, packQty: number) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function scanned(code: string) {
    const hit = matchCode(items, code);
    if (!hit) {
      setNotice(`No item has the barcode ${code}.`);
      return;
    }
    setNotice(null);
    onPick(hit.item, hit.packQty);
  }
  useBarcodeScanner(scanned);

  const q = query.trim().toLowerCase();
  const results = q
    ? items.filter((i) => i.name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q) || i.barcodes?.some((b) => b.code.includes(q))).slice(0, 8)
    : [];

  function choose(item: T, packQty = 1) {
    onPick(item, packQty);
    setQuery("");
    setNotice(null);
    input.current?.focus();
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <input
        ref={input}
        data-scan-target
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !query.trim()) return;
          e.preventDefault();
          const hit = matchCode(items, query);
          if (hit) return choose(hit.item, hit.packQty);
          if (results[0]) return choose(results[0]);
          setNotice(`Nothing matches "${query}".`);
        }}
        placeholder={placeholder}
        aria-label="Find an item"
        className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500"
      />
      {notice && <p className="mt-1.5 text-xs font-medium text-rose-600">{notice}</p>}
      {results.length > 0 && (
        <ul className="absolute left-0 right-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => choose(r)} className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm hover:bg-neutral-50">
                <span className="font-medium text-neutral-800">{r.name}</span>
                <span className="text-xs text-neutral-400">{[r.sku, r.unit].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
