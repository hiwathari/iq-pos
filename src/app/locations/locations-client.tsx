"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, MapPin, MoveRight, Pencil, Plus, Printer, Trash2, X } from "lucide-react";
import { deleteLocationAction, moveLocationStockAction, saveLocationAction, type LocationInput } from "@/lib/actions/locations";
import type { LocationContent } from "@/lib/data/locations";

type Loc = { id: string; code: string; name: string | null; kind: LocationInput["kind"]; parentId: string | null; pickable: boolean; sort: number };
type Item = { id: string; name: string; unit: string; quantity: number; unallocated: number };

const KIND: Record<string, string> = { zone: "Zone", aisle: "Aisle", bin: "Bin", shop_floor: "Shop floor", backroom: "Backroom" };
const q3 = (n: number) => Math.round(n * 1000) / 1000;

// Locations & bins (docs/retail-plan step 6.1).
export function LocationsClient({ locations, contents, items }: { locations: Loc[]; contents: Record<string, LocationContent[]>; items: Item[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<Loc | "new" | null>(null);
  const [moving, setMoving] = useState<{ to?: string; from?: string; itemId?: string } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const unplaced = items.filter((i) => i.unallocated > 0);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Locations</h1>
          <p className="text-sm text-neutral-400">Zones, aisles and bins — where each item sits. Put stock away after Goods in, and move it between bins; the totals on the Stock page never change.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/locations/labels" className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
            <Printer className="h-4 w-4" /> Bin labels
          </Link>
          <button onClick={() => setMoving({})} className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
            <MoveRight className="h-4 w-4" /> Put away / move
          </button>
          <button onClick={() => setEditing("new")} className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
            <Plus className="h-4 w-4" /> New Location
          </button>
        </div>
      </div>
      {notice && <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">{notice}</p>}
      {unplaced.length > 0 && (
        <p className="mb-4 rounded-xl bg-sky-50 px-4 py-2.5 text-sm text-sky-700">
          {unplaced.length} item{unplaced.length === 1 ? " has" : "s have"} stock not yet put in a bin (e.g. {unplaced[0].name}: {unplaced[0].unallocated} {unplaced[0].unit}).
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        {locations.map((l) => {
          const list = contents[l.id] ?? [];
          const isOpen = open.has(l.id);
          const parent = locations.find((p) => p.id === l.parentId);
          return (
            <div key={l.id} className="border-t border-neutral-100 first:border-t-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <button onClick={() => setOpen((cur) => { const n = new Set(cur); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} className="text-neutral-400" aria-label={`Show ${l.code}`}>
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-light)] text-[var(--brand-dark)]">
                  <MapPin className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-semibold text-neutral-800">{l.code}</div>
                  <div className="text-xs text-neutral-400">
                    {[KIND[l.kind], l.name, parent ? `in ${parent.code}` : null, l.pickable ? null : "not pickable"].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span className="text-sm text-neutral-500">{list.length} item{list.length === 1 ? "" : "s"}</span>
                <button onClick={() => setMoving({ to: l.id })} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[var(--brand-dark)] hover:bg-[var(--brand-light)]">
                  Put stock here
                </button>
                <button onClick={() => setEditing(l)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100" aria-label={`Edit ${l.code}`}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => confirm(`Delete ${l.code}?`) && startTransition(async () => { const r = await deleteLocationAction(l.id); setNotice(r.error ?? null); router.refresh(); })}
                  className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Delete ${l.code}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {isOpen && (
                <div className="bg-neutral-50 px-14 py-2">
                  {list.length === 0 && <p className="py-1 text-sm text-neutral-400">Empty.</p>}
                  {list.map((c) => (
                    <div key={c.itemId} className="flex items-center justify-between py-1 text-sm">
                      <span className="text-neutral-700">{c.name}</span>
                      <span className="flex items-center gap-3">
                        <span className="font-semibold text-neutral-800">{q3(c.quantity)} {c.unit}</span>
                        <button onClick={() => setMoving({ from: l.id, itemId: c.itemId })} className="text-xs font-semibold text-[var(--brand-dark)] hover:underline">
                          Move
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {locations.length === 0 && <p className="px-5 py-10 text-center text-neutral-400">No locations yet — add your first bin, e.g. A-01-1.</p>}
      </div>

      {editing && <LocationModal initial={editing === "new" ? null : editing} locations={locations} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh(); }} />}
      {moving && <MoveModal start={moving} locations={locations} items={items} contents={contents} onClose={() => setMoving(null)} onDone={() => { setMoving(null); router.refresh(); }} />}
    </div>
  );
}

function LocationModal({ initial, locations, onClose, onSaved }: { initial: Loc | null; locations: Loc[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ code: initial?.code ?? "", name: initial?.name ?? "", kind: (initial?.kind ?? "bin") as Loc["kind"], parentId: initial?.parentId ?? "", pickable: initial?.pickable ?? true, sort: String(initial?.sort ?? 0) });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const input = "w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500";
  const label = "mb-1 block text-xs font-medium text-neutral-500";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Location">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{initial ? "Edit Location" : "New Location"}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Code (printed on the label)</label>
            <input autoFocus value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="A-03-2" className={`${input} font-mono`} />
          </div>
          <div>
            <label className={label}>Kind</label>
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Loc["kind"] })} className={input}>
              {Object.entries(KIND).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className={label}>Name (optional)</label>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} />
          </div>
          <div>
            <label className={label}>Inside</label>
            <select value={f.parentId} onChange={(e) => setF({ ...f, parentId: e.target.value })} className={input}>
              <option value="">Top level</option>
              {locations.filter((l) => l.id !== initial?.id).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Walking order (picking)</label>
            <input type="number" min="0" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} className={input} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={f.pickable} onChange={(e) => setF({ ...f, pickable: e.target.checked })} className="h-4 w-4 accent-[var(--brand)]" /> Stock here can be picked for orders
          </label>
        </div>
        {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
        <button
          disabled={pending}
          onClick={() => startTransition(async () => {
            const r = await saveLocationAction(initial?.id ?? null, { code: f.code, name: f.name, kind: f.kind, parentId: f.parentId || null, pickable: f.pickable, sort: Number(f.sort) || 0 });
            if (r.error) return setError(r.error);
            onSaved();
          })}
          className="mt-4 w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
        >
          {initial ? "Save Changes" : "Add Location"}
        </button>
      </div>
    </div>
  );
}

function MoveModal({ start, locations, items, contents, onClose, onDone }: { start: { to?: string; from?: string; itemId?: string }; locations: Loc[]; items: Item[]; contents: Record<string, LocationContent[]>; onClose: () => void; onDone: () => void }) {
  const [itemId, setItemId] = useState(start.itemId ?? "");
  const [from, setFrom] = useState(start.from ?? "");
  const [to, setTo] = useState(start.to ?? "");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const item = items.find((i) => i.id === itemId);
  const inFrom = from && itemId ? (contents[from] ?? []).find((c) => c.itemId === itemId)?.quantity ?? 0 : null;
  const input = "w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500";
  const label = "mb-1 block text-xs font-medium text-neutral-500";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Put away or move stock">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Put away / move stock</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className={label}>Item</label>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} aria-label="Item" className={`mb-3 ${input}`}>
          <option value="">Choose an item…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <label className={label}>From</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" className={input}>
              <option value="">Not yet put away{item ? ` (${item.unallocated})` : ""}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>To</label>
            <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" className={input}>
              <option value="">Choose a bin…</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className={label}>Quantity{item ? ` (${item.unit})` : ""}</label>
        <input value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" aria-label="Quantity" placeholder={inFrom != null ? `up to ${q3(inFrom)}` : item ? `up to ${item.unallocated}` : ""} className={`mb-3 ${input}`} />
        {error && <p className="mb-3 text-xs font-medium text-rose-600">{error}</p>}
        <button
          disabled={pending || !itemId || !to || !qty}
          onClick={() => startTransition(async () => {
            const r = await moveLocationStockAction({ itemId, fromLocationId: from || null, toLocationId: to, qty: Number(qty) });
            if (r.error) return setError(r.error);
            onDone();
          })}
          className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
        >
          Move
        </button>
      </div>
    </div>
  );
}
