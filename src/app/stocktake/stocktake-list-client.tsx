"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { startStockCountAction } from "@/lib/actions/stocktake";
import type { StockCount } from "@/lib/types";

const STATUS: Record<string, { label: string; tone: string }> = {
  open: { label: "Counting", tone: "bg-sky-50 text-sky-700" },
  posted: { label: "Posted", tone: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Cancelled", tone: "bg-neutral-100 text-neutral-500" },
};

export function StocktakeListClient({
  counts,
  categories,
}: {
  counts: (StockCount & { lineCount: number; countedCount: number })[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);

  function start() {
    setError(null);
    startTransition(async () => {
      const res = await startStockCountAction({ name, categoryId: categoryId || null });
      if (res.error) return setError(res.error);
      router.push(`/stocktake/${res.id}`);
    });
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold text-neutral-900">Stocktake</h1>
      <p className="mb-5 text-sm text-neutral-400">Count what&apos;s really on the shelves, review the differences, and set stock to match. Several people can count at once.</p>

      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="min-w-48 flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-500">Name (optional)</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Monthly count" className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">What to count</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm">
            <option value="">Everything</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} only
              </option>
            ))}
          </select>
        </div>
        <button disabled={pending} onClick={start} className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
          <ClipboardCheck className="h-4 w-4" /> Start stocktake
        </button>
        {error && <p className="w-full text-sm font-medium text-rose-600">{error}</p>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="px-5 py-3">Stocktake</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Counted</th>
              <th className="px-4 py-3">Started</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {counts.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50">
                <td className="px-5 py-3 font-semibold">
                  <Link href={`/stocktake/${c.id}`} className="text-[var(--brand-dark)] hover:underline">
                    {c.name ?? "Stocktake"}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
                </td>
                <td className="px-4 py-3 text-neutral-500">
                  {c.countedCount} of {c.lineCount}
                </td>
                <td className="px-4 py-3 text-xs text-neutral-400">
                  {new Date(c.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  {c.startedByName ? ` · ${c.startedByName}` : ""}
                </td>
              </tr>
            ))}
            {counts.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-10 text-center text-neutral-400">
                  No stocktakes yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
