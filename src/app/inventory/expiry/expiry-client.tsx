"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { writeOffBatchAction } from "@/lib/actions/locations";
import { formatMoney } from "@/lib/types";

type Row = { id: string; name: string; unit: string; lot: string | null; expiresOn: string; quantity: number; costPrice: number | null };

// Expiry report (docs/retail-plan step 6.2): expired, then due within 7 / 14 / 30 days, each batch
// with a one-tap write-off to waste.
export function ExpiryClient({ rows, currencySymbol }: { rows: Row[]; currencySymbol: string; timezone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/purity
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const days = (d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86400000);
  const groups = [
    { label: "Expired", rows: rows.filter((r) => days(r.expiresOn) < 0), tone: "text-rose-600" },
    { label: "Within 7 days", rows: rows.filter((r) => days(r.expiresOn) >= 0 && days(r.expiresOn) <= 7), tone: "text-amber-600" },
    { label: "8–14 days", rows: rows.filter((r) => days(r.expiresOn) > 7 && days(r.expiresOn) <= 14), tone: "text-amber-500" },
    { label: "15–30 days", rows: rows.filter((r) => days(r.expiresOn) > 14 && days(r.expiresOn) <= 30), tone: "text-neutral-600" },
  ];
  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/inventory" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="h-4 w-4" /> Stock
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">Expiry</h1>
      <p className="mb-5 text-sm text-neutral-400">Batches with a best-before date, soonest first. Sales and picks take the earliest expiry first.</p>
      {error && <p className="mb-3 text-sm font-medium text-rose-600">{error}</p>}
      {groups.every((g) => g.rows.length === 0) && <p className="rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center text-neutral-400">Nothing expires in the next 30 days.</p>}
      <div className="space-y-5">
        {groups.filter((g) => g.rows.length > 0).map((g) => (
          <section key={g.label} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
            <h2 className={`border-b border-neutral-100 px-4 py-3 text-sm font-semibold ${g.tone}`}>
              {g.label} · {g.rows.length}
              {g.label === "Expired" && ` · ${formatMoney(g.rows.reduce((s, r) => s + r.quantity * (r.costPrice ?? 0), 0), currencySymbol)} at cost`}
            </h2>
            {g.rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 border-t border-neutral-100 px-4 py-2.5 first:border-t-0">
                <div className="min-w-0">
                  <div className="font-medium text-neutral-800">{r.name}</div>
                  <div className="text-xs text-neutral-400">
                    {r.lot ? `Lot ${r.lot} · ` : ""}
                    {new Date(r.expiresOn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </div>
                </div>
                <span className="text-sm font-semibold text-neutral-700">
                  {Math.round(r.quantity * 1000) / 1000} {r.unit}
                </span>
                <button
                  disabled={pending}
                  onClick={() => confirm(`Write off ${r.quantity} ${r.unit} of ${r.name}?`) && startTransition(async () => { const res = await writeOffBatchAction(r.id); setError(res.error ?? null); router.refresh(); })}
                  className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  Write off
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
