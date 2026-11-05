"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Monitor, X } from "lucide-react";
import { revokeTillAction, setPlanAction } from "@/lib/actions/sites";
import type { SiteOverview } from "@/lib/data/site-overview";

const money = (n: number) => `£${n.toFixed(2)}`;

// Multi-site overview and till licences (docs/retail-plan step 6.8).
export function SitesClient({ sites, isSuperAdmin }: { sites: SiteOverview[]; isSuperAdmin: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const totals = sites.reduce((a, s) => ({ today: a.today + s.today, week: a.week + s.week, stock: a.stock + s.stockValue }), { today: 0, week: 0, stock: 0 });
  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link href="/super-admin" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="h-4 w-4" /> Super Admin
      </Link>
      <h1 className="text-xl font-semibold text-neutral-900">Sites overview</h1>
      <p className="mb-5 text-sm text-neutral-400">Every site you manage side by side: takings, stock value, transfers in flight and tills against each plan.</p>
      {notice && <p className="mb-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{notice}</p>}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          ["Today, all sites", totals.today],
          ["Last 7 days", totals.week],
          ["Stock at cost", totals.stock],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3">
            <div className="text-xs font-medium text-neutral-400">{l as string}</div>
            <div className="text-xl font-semibold text-neutral-900">{money(v as number)}</div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {sites.map((s) => (
          <div key={s.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-neutral-800">{s.name}</div>
                <div className="text-xs capitalize text-neutral-400">{s.businessType}</div>
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold text-neutral-800">{money(s.today)} today <span className="font-normal text-neutral-400">({s.ordersToday} orders)</span></div>
                <div className="text-xs text-neutral-400">{money(s.week)} in 7 days · stock {money(s.stockValue)}{s.openTransfers ? ` · ${s.openTransfers} transfer${s.openTransfers === 1 ? "" : "s"} in flight` : ""}</div>
              </div>
              <div>
                <label className="mb-0.5 block text-[11px] font-medium text-neutral-400">Plan</label>
                <select
                  disabled={!isSuperAdmin}
                  value={s.plan ?? ""}
                  onChange={(e) => startTransition(async () => { const r = await setPlanAction(s.id, (e.target.value || null) as "basic" | "standard" | "premium" | null); setNotice(r.error ?? null); router.refresh(); })}
                  aria-label={`Plan for ${s.name}`}
                  className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm disabled:bg-neutral-50"
                >
                  <option value="">No limit</option>
                  <option value="basic">Basic · 1 till</option>
                  <option value="standard">Standard · 3 tills</option>
                  <option value="premium">Premium · unlimited</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-100 pt-3 text-sm">
              <span className="text-xs font-medium text-neutral-400">Tills {s.tills.length}{s.tillLimit !== null ? ` of ${s.tillLimit}` : ""}:</span>
              {s.tills.length === 0 && <span className="text-xs text-neutral-400">none signed in yet</span>}
              {s.tills.map((t) => (
                <span key={t.id} className="flex items-center gap-1.5 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
                  <Monitor className="h-3 w-3" /> {t.name}
                  {t.lastSeenAt ? <span className="text-neutral-400">· {new Date(t.lastSeenAt).toLocaleDateString("en-GB")}</span> : null}
                  <button onClick={() => confirm(`Remove ${t.name} from ${s.name}? It will need to be signed in again.`) && startTransition(async () => { const r = await revokeTillAction(t.id); setNotice(r.error ?? null); router.refresh(); })} aria-label={`Remove ${t.name}`} className="text-neutral-400 hover:text-rose-600">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        ))}
        {sites.length === 0 && <p className="rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center text-neutral-400">No sites assigned to you yet.</p>}
      </div>
    </div>
  );
}
