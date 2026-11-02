"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { searchSerialsAction, type SerialInfo } from "@/lib/actions/serials";

const STATUS: Record<string, { label: string; tone: string }> = {
  in_stock: { label: "In stock", tone: "bg-emerald-50 text-emerald-700" },
  sold: { label: "Sold", tone: "bg-sky-50 text-sky-700" },
  returned: { label: "Returned", tone: "bg-amber-50 text-amber-700" },
  faulty: { label: "Faulty", tone: "bg-rose-50 text-rose-600" },
};

// Find a serial / IMEI (docs/retail-plan step 5.2): where it is, when it was sold and on which order.
export function SerialsClient() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SerialInfo[] | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    startTransition(async () => setRows(await searchSerialsAction(query)));
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/inventory" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="h-4 w-4" /> Stock
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">Serial numbers</h1>
      <p className="mb-5 text-sm text-neutral-400">Type or scan all or part of a serial / IMEI (3 characters or more).</p>
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          autoFocus
          data-scan-target
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Serial / IMEI"
          aria-label="Serial number"
          className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-24 font-mono text-sm outline-none focus:border-teal-500"
        />
        <button onClick={search} disabled={pending} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
          Find
        </button>
      </div>
      {rows && (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          {rows.length === 0 && <p className="px-5 py-8 text-center text-neutral-400">No serial matches.</p>}
          {rows.map((r) => (
            <div key={r.serial} className="flex items-center justify-between gap-3 border-t border-neutral-100 px-5 py-3 first:border-t-0">
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold text-neutral-800">{r.serial}</div>
                <div className="truncate text-sm text-neutral-500">{r.productName}</div>
                <div className="text-xs text-neutral-400">
                  {r.receivedAt ? `Received ${new Date(r.receivedAt).toLocaleDateString("en-GB")}` : ""}
                  {r.soldAt ? ` · sold ${new Date(r.soldAt).toLocaleDateString("en-GB")}` : ""}
                  {r.orderId && r.orderNumber && (
                    <>
                      {" · "}
                      <Link href={`/invoice/${r.orderId}`} className="font-medium text-[var(--brand-dark)] hover:underline">
                        Order {r.orderNumber}
                      </Link>
                    </>
                  )}
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[r.status]?.tone ?? ""}`}>{STATUS[r.status]?.label ?? r.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
