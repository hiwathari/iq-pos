"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { pushProductsAction, setLocalPriceAction, type PushResult } from "@/lib/actions/catalogue";

type Product = { id: string; name: string; price: number; sku: string | null; category: string; masterId: string | null; localPrice: boolean };

// Central catalogue (docs/retail-plan step 6.7): pick products here and push them to your other
// sites; pushing again keeps every site's copy in step.
export function CatalogueClient({ sites, products }: { sites: { id: string; name: string }[]; products: Product[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Set<string>>(new Set(sites.map((s) => s.id)));
  const [updatePrices, setUpdatePrices] = useState(true);
  const [result, setResult] = useState<PushResult | null>(null);
  const shown = useMemo(() => products.filter((p) => !query.trim() || `${p.name} ${p.sku ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())), [products, query]);
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); return n; };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="text-xl font-semibold text-neutral-900">Central catalogue</h1>
      <p className="mb-5 text-sm text-neutral-400">Manage products once, here, and push them to your other sites. Each site gets a linked copy — name, barcodes, VAT and cost follow the master; prices too unless that site keeps its own.</p>
      <div className="mb-4 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="mb-2 text-xs font-medium text-neutral-500">Push to</div>
        <div className="mb-3 flex flex-wrap gap-2">
          {sites.map((s) => (
            <label key={s.id} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-sm">
              <input type="checkbox" checked={targets.has(s.id)} onChange={() => setTargets((c) => toggle(c, s.id))} className="accent-[var(--brand)]" /> {s.name}
            </label>
          ))}
        </div>
        <label className="mb-3 flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={updatePrices} onChange={(e) => setUpdatePrices(e.target.checked)} className="accent-[var(--brand)]" /> Update prices on existing copies (sites marked &quot;own price&quot; are left alone)
        </label>
        <div className="flex items-center gap-3">
          <button
            disabled={pending || picked.size === 0 || targets.size === 0}
            onClick={() => startTransition(async () => { setResult(await pushProductsAction({ dishIds: [...picked], siteIds: [...targets], updatePrices })); router.refresh(); })}
            className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
          >
            Push {picked.size} product{picked.size === 1 ? "" : "s"}
          </button>
          {result && (result.error ? <span className="text-sm font-medium text-rose-600">{result.error}</span> : <span className="text-sm font-medium text-emerald-600">{result.created} created, {result.updated} updated{result.skipped?.length ? `, skipped: ${result.skipped.join(", ")}` : ""}.</span>)}
        </div>
      </div>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products" className="w-full rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="flex items-center gap-3 border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs font-medium text-neutral-500">
          <input type="checkbox" aria-label="Select all shown" checked={shown.length > 0 && shown.every((p) => picked.has(p.id))} onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((p) => p.id)) : new Set())} className="accent-[var(--brand)]" />
          {shown.length} products
        </div>
        {shown.map((p) => (
          <label key={p.id} className="flex cursor-pointer items-center gap-3 border-t border-neutral-100 px-4 py-2.5 first:border-t-0">
            <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((c) => toggle(c, p.id))} aria-label={`Push ${p.name}`} className="accent-[var(--brand)]" />
            <span className="min-w-0 flex-1">
              <span className="font-medium text-neutral-800">{p.name}</span>
              <span className="ml-2 text-xs text-neutral-400">{[p.category, p.sku].filter(Boolean).join(" · ")}</span>
            </span>
            {p.masterId && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-700">linked copy</span>}
            {p.masterId && (
              <button type="button" onClick={(e) => { e.preventDefault(); startTransition(async () => { await setLocalPriceAction(p.id, !p.localPrice); router.refresh(); }); }} className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.localPrice ? "bg-amber-100 text-amber-800" : "border border-neutral-200 text-neutral-500"}`}>
                {p.localPrice ? "Own price" : "Master price"}
              </button>
            )}
            <span className="w-16 text-right text-sm text-neutral-600">£{p.price.toFixed(2)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
