"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { checkSerialAction, listAvailableSerialsAction } from "@/lib/actions/serials";

// Which serial / IMEI is being sold (docs/retail-plan step 5.2): scan or type it, or pick from
// what's in stock. Only serials recorded at Goods in for this product can be sold.
export function SerialPicker({
  name,
  dishId,
  variantId,
  taken,
  onPick,
  onClose,
}: {
  name: string;
  dishId: string;
  variantId?: string | null;
  taken: string[];
  onPick: (serial: string) => void;
  onClose: () => void;
}) {
  const [available, setAvailable] = useState<string[] | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listAvailableSerialsAction(dishId, variantId).then((r) => alive && setAvailable(r));
    return () => {
      alive = false;
    };
  }, [dishId, variantId]);

  async function submit(raw: string) {
    const code = raw.trim();
    if (!code) return;
    if (taken.includes(code)) return setError(`${code} is already on this sale.`);
    const res = await checkSerialAction(code);
    if (res.error || !res.serial) return setError(res.error ?? "That serial can't be sold.");
    if (res.dishId !== dishId) return setError(`${code} belongs to a different product.`);
    if (variantId && res.variantId !== variantId) return setError(`${code} is a different option of this product.`);
    onPick(res.serial);
  }

  const list = (available ?? []).filter((s) => !taken.includes(s));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Serial number for ${name}`}>
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Serial number</h2>
            <p className="text-sm text-neutral-500">{name}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <input
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit(value)}
          placeholder="Scan or type the serial / IMEI"
          aria-label="Serial number"
          className="mb-2 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 font-mono text-sm outline-none focus:border-teal-500"
        />
        {error && <p className="mb-2 text-xs font-medium text-rose-600">{error}</p>}
        <div className="mb-1 text-xs font-medium text-neutral-400">In stock{available ? ` (${list.length})` : ""}</div>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {available === null && <p className="text-sm text-neutral-400">Loading…</p>}
          {available && list.length === 0 && <p className="text-sm text-neutral-400">No serials in stock — receive some under Stock → Goods in.</p>}
          {list.map((s) => (
            <button key={s} type="button" onClick={() => onPick(s)} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-left font-mono text-sm hover:border-[var(--brand)] hover:bg-[var(--brand-light)]">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
