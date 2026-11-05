"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Trash2, X } from "lucide-react";
import { StockItemPicker } from "@/components/stock-item-picker";
import { cancelTransferAction, receiveTransferAction, saveTransferAction, sendTransferAction } from "@/lib/actions/transfers";

type Line = { name: string; unit: string; sku: string | null; barcode: string | null; fromItemId: string; qty: number; received: number | null };
type Transfer = { id: string; number: string; status: string; direction: "in" | "out"; fromName: string; toName: string; createdAt: number; lines: Line[] };
type Item = { id: string; name: string; unit: string; quantity: number; sku: string | null; barcodes: { code: string; packQty: number }[] };

const STATUS: Record<string, string> = { draft: "bg-neutral-100 text-neutral-600", sent: "bg-sky-50 text-sky-700", received: "bg-emerald-50 text-emerald-700", cancelled: "bg-rose-50 text-rose-600" };

// Transfers between sites (docs/retail-plan step 6.5): send from here, receive when acting as the
// destination site. Needs a Regional Admin or Super Admin login (the only ones who manage 2+ sites).
export function TransfersClient({ transfers, otherSites, items }: { transfers: Transfer[]; otherSites: { id: string; name: string }[]; items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<Transfer | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string }>) => startTransition(async () => { const r = await fn(); setNotice(r.error ?? null); router.refresh(); });

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Transfers</h1>
          <p className="text-sm text-neutral-400">Move stock between your sites. Stock leaves this site when you send it and arrives at the other when it&apos;s received there.</p>
        </div>
        {otherSites.length > 0 && (
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
            <Plus className="h-4 w-4" /> New Transfer
          </button>
        )}
      </div>
      {otherSites.length === 0 && <p className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-700">Transfers need a second site you manage — sign in as a Regional Admin (or Super Admin) with two or more sites.</p>}
      {notice && <p className="mb-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{notice}</p>}
      <div className="space-y-3">
        {transfers.map((t) => (
          <div key={t.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-light)] text-[var(--brand-dark)]">{t.direction === "out" ? <ArrowUpFromLine className="h-4 w-4" /> : <ArrowDownToLine className="h-4 w-4" />}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-neutral-800">
                  {t.number} · {t.fromName} → {t.toName}
                </div>
                <div className="text-xs text-neutral-400">{new Date(t.createdAt).toLocaleDateString("en-GB")} · {t.lines.length} line{t.lines.length === 1 ? "" : "s"}</div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[t.status]}`}>{t.status}</span>
              {t.direction === "out" && t.status === "draft" && (
                <button disabled={pending} onClick={() => run(() => sendTransferAction(t.id))} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
                  Send
                </button>
              )}
              {t.direction === "out" && (t.status === "draft" || t.status === "sent") && (
                <button disabled={pending} onClick={() => confirm(`Cancel ${t.number}?`) && run(() => cancelTransferAction(t.id))} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50">
                  Cancel
                </button>
              )}
              {t.direction === "in" && t.status === "sent" && (
                <button onClick={() => setReceiving(t)} className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--brand-dark)]">
                  Receive
                </button>
              )}
            </div>
            <div className="mt-2 text-sm text-neutral-600">
              {t.lines.map((l) => (
                <span key={l.fromItemId} className="mr-3 inline-block">
                  {l.qty} {l.unit} {l.name}
                  {l.received != null && l.received !== l.qty && <b className="ml-1 text-amber-600">(received {l.received})</b>}
                </span>
              ))}
            </div>
          </div>
        ))}
        {transfers.length === 0 && <p className="rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center text-neutral-400">No transfers yet.</p>}
      </div>
      {creating && <NewTransfer otherSites={otherSites} items={items} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); router.refresh(); }} />}
      {receiving && <ReceiveModal transfer={receiving} onClose={() => setReceiving(null)} onDone={() => { setReceiving(null); router.refresh(); }} />}
    </div>
  );
}

function NewTransfer({ otherSites, items, onClose, onSaved }: { otherSites: { id: string; name: string }[]; items: Item[]; onClose: () => void; onSaved: () => void }) {
  const [to, setTo] = useState(otherSites[0]?.id ?? "");
  const [lines, setLines] = useState<{ item: Item; qty: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New transfer">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">New Transfer</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="mb-1 block text-xs font-medium text-neutral-500">Send to</label>
        <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Destination site" className="mb-3 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm">
          {otherSites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <StockItemPicker items={items} onPick={(item, pack) => setLines((cur) => (cur.some((l) => l.item.id === item.id) ? cur.map((l) => (l.item.id === item.id ? { ...l, qty: String(Number(l.qty) + pack) } : l)) : [...cur, { item: item as Item, qty: String(pack) }]))} />
        <div className="mt-3 space-y-2">
          {lines.map((l, i) => (
            <div key={l.item.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{l.item.name}</span>
              <span className="text-xs text-neutral-400">{l.item.quantity} here</span>
              <input value={l.qty} onChange={(e) => setLines((cur) => cur.map((x, j) => (j === i ? { ...x, qty: e.target.value.replace(/[^0-9.]/g, "") } : x)))} aria-label={`Quantity of ${l.item.name}`} className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm" />
              <button onClick={() => setLines((cur) => cur.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-rose-600" aria-label={`Remove ${l.item.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
        <button
          disabled={pending || lines.length === 0}
          onClick={() => startTransition(async () => {
            const r = await saveTransferAction(null, { toRestaurantId: to, lines: lines.map((l) => ({ itemId: l.item.id, qty: Number(l.qty) })) });
            if (r.error) return setError(r.error);
            onSaved();
          })}
          className="mt-4 w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
        >
          Save draft
        </button>
      </div>
    </div>
  );
}

function ReceiveModal({ transfer, onClose, onDone }: { transfer: Transfer; onClose: () => void; onDone: () => void }) {
  const [got, setGot] = useState<Record<string, string>>(Object.fromEntries(transfer.lines.map((l) => [l.fromItemId, String(l.qty)])));
  const [missing, setMissing] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const go = (createMissing: boolean) =>
    startTransition(async () => {
      const r = await receiveTransferAction(transfer.id, { received: Object.fromEntries(Object.entries(got).map(([k, v]) => [k, Number(v) || 0])), createMissing });
      if (r.missing) return setMissing(r.missing);
      if (r.error) return setError(r.error);
      onDone();
    });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Receive transfer">
        <h2 className="mb-1 text-lg font-semibold text-neutral-900">Receive {transfer.number}</h2>
        <p className="mb-3 text-sm text-neutral-500">From {transfer.fromName}. Enter what actually arrived.</p>
        <div className="space-y-2">
          {transfer.lines.map((l) => (
            <div key={l.fromItemId} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{l.name}</span>
              <span className="text-xs text-neutral-400">sent {l.qty}</span>
              <input value={got[l.fromItemId]} onChange={(e) => setGot((cur) => ({ ...cur, [l.fromItemId]: e.target.value.replace(/[^0-9.]/g, "") }))} aria-label={`Received ${l.name}`} className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm" />
            </div>
          ))}
        </div>
        {missing && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Not set up at this site yet: {missing.join(", ")}. Receive anyway and create them as plain stock items?
          </p>
        )}
        {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
        <button disabled={pending} onClick={() => go(!!missing)} className="mt-4 w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
          {missing ? "Create them and receive" : "Receive"}
        </button>
      </div>
    </div>
  );
}
