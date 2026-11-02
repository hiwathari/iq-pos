"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { StockItemPicker, type PickItem } from "@/components/stock-item-picker";
import { cancelStockCountAction, postStockCountAction, setCountedAction } from "@/lib/actions/stocktake";
import type { CountLineView } from "@/lib/data/stock-counts";
import { formatMoney } from "@/lib/types";

const n3 = (n: number) => Math.round(n * 1000) / 1000;

// The count screen (docs/retail-plan step 4.6): scan each item (+1 per scan, or a case's pack
// size) or type the quantity. Expected quantities stay hidden while counting so nobody counts to
// the number — "Show differences" is the review.
export function StocktakeClient({
  count,
  barcodes,
  currencySymbol,
}: {
  count: { id: string; name: string; status: string; lines: CountLineView[] };
  barcodes: Record<string, { code: string; packQty: number }[]>;
  currencySymbol: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const open = count.status === "open";
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(count.lines.map((l) => [l.id, l.counted != null ? String(l.counted) : ""])));
  const [review, setReview] = useState(!open);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "todo" | "diff">("all");

  const pickItems: (PickItem & { lineId: string })[] = count.lines.map((l) => ({ id: l.inventoryItemId, lineId: l.id, name: l.name, unit: l.unit, barcodes: barcodes[l.inventoryItemId] ?? [] }));

  function save(lineId: string, text: string) {
    const value = text.trim() === "" ? null : Number(text);
    startTransition(async () => {
      const res = await setCountedAction(count.id, lineId, value);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function scanned(item: PickItem & { lineId: string }, packQty: number) {
    const next = String(n3((Number(values[item.lineId]) || 0) + packQty));
    setValues((cur) => ({ ...cur, [item.lineId]: next }));
    save(item.lineId, next);
  }

  // Differences are worked out on the server from what was counted; what's typed but not yet
  // saved isn't included until the field loses focus.
  const lines = count.lines;
  const counted = lines.filter((l) => l.counted != null);
  const diffs = counted.filter((l) => Math.abs(l.variance ?? 0) > 1e-9);
  const worth = diffs.reduce((s, l) => s + (l.variance ?? 0) * (l.costPrice ?? 0), 0);
  const shown = lines.filter((l) => (filter === "todo" ? l.counted == null : filter === "diff" ? Math.abs(l.variance ?? 0) > 1e-9 : true));

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/stocktake" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="h-4 w-4" /> Stocktakes
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">{count.name}</h1>
          <p className="text-sm text-neutral-400">
            {counted.length} of {lines.length} counted
            {counted.length > 0 && ` · ${diffs.length} difference${diffs.length === 1 ? "" : "s"}`}
            {review && diffs.length > 0 && ` · ${worth < 0 ? "−" : "+"}${formatMoney(Math.abs(worth), currencySymbol)} at cost`}
          </p>
        </div>
        {open && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setReview((v) => !v)} className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
              {review ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {review ? "Hide differences" : "Show differences"}
            </button>
            <button
              disabled={pending || counted.length === 0}
              onClick={() => {
                if (!confirm(`Set stock to the counted quantities for ${counted.length} item${counted.length === 1 ? "" : "s"}? Items not counted are left alone.`)) return;
                startTransition(async () => {
                  const res = await postStockCountAction(count.id);
                  if (res.error) return setError(res.error);
                  router.refresh();
                });
              }}
              className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
            >
              Post stocktake
            </button>
            <button
              disabled={pending}
              onClick={() => confirm("Cancel this stocktake? Nothing changes in stock.") && startTransition(async () => { await cancelStockCountAction(count.id); router.refresh(); })}
              className="rounded-xl border border-rose-200 px-3.5 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      {!open && <p className="mb-4 rounded-xl bg-neutral-100 px-4 py-2.5 text-sm text-neutral-600">This stocktake is {count.status === "posted" ? "posted — stock was set to the counted quantities" : "cancelled"}.</p>}
      {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}

      {open && (
        <div className="mb-4">
          <StockItemPicker items={pickItems} onPick={(item, pack) => scanned(item as PickItem & { lineId: string }, pack)} placeholder="Scan an item to count it (+1 each scan), or search" autoFocus />
        </div>
      )}

      <div className="mb-3 flex gap-2">
        {(["all", "todo", "diff"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-3 py-1.5 text-sm font-medium ${filter === f ? "bg-[var(--brand)] text-white" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"}`}>
            {f === "all" ? "All" : f === "todo" ? "Not counted" : "Differences"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-4 py-3">Item</th>
              {review && <th className="px-4 py-3">System</th>}
              <th className="px-4 py-3">Counted</th>
              {review && <th className="px-4 py-3 text-right">Difference</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {shown.map((l) => (
              <tr key={l.id} className={review && l.variance != null && Math.abs(l.variance) > 1e-9 ? "bg-amber-50/40" : undefined}>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-neutral-800">{l.name}</div>
                  {l.countedByName && <div className="text-xs text-neutral-400">{l.countedByName}</div>}
                </td>
                {review && <td className="px-4 py-2.5 text-neutral-500">{l.systemAtCount != null ? `${l.systemAtCount} ${l.unit}` : `${n3(l.expected)} ${l.unit}`}</td>}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      value={values[l.id] ?? ""}
                      disabled={!open}
                      onChange={(e) => setValues((cur) => ({ ...cur, [l.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                      onBlur={(e) => open && e.target.value !== (l.counted != null ? String(l.counted) : "") && save(l.id, e.target.value)}
                      inputMode="decimal"
                      aria-label={`Counted ${l.name}`}
                      placeholder="—"
                      className="w-24 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm outline-none focus:border-teal-500 disabled:bg-neutral-50"
                    />
                    <span className="text-xs text-neutral-400">{l.unit}</span>
                  </div>
                </td>
                {review && (
                  <td className={`px-4 py-2.5 text-right font-semibold ${l.variance == null ? "text-neutral-300" : l.variance < 0 ? "text-rose-600" : l.variance > 0 ? "text-emerald-600" : "text-neutral-400"}`}>
                    {l.variance == null ? "—" : `${l.variance > 0 ? "+" : ""}${l.variance}`}
                    {l.variance != null && l.variance !== 0 && l.costPrice != null && (
                      <div className="text-xs font-normal text-neutral-400">
                        {l.variance < 0 ? "−" : "+"}
                        {formatMoney(Math.abs(l.variance * l.costPrice), currencySymbol)}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                  Nothing here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
