"use client";

import { useEffect, useState } from "react";
import { Delete, Scale, X } from "lucide-react";
import { formatMoney, lineTotal } from "@/lib/types";
import { readScaleWeight, scaleConfigured } from "@/lib/scale";

// The Till's number pad (docs/retail-plan steps 3.3 / 3.4). Weight mode: enter the weight of a
// product sold by weight / volume / length — in g or kg (ml / l, cm / m), with tare taken off —
// and see the price live; "Read scale" fills it from a connected scale (step 3.10). Quantity mode:
// type how many of a counted product. Used from a tile tap, a scan, or tapping a cart line.

const SMALL_UNIT: Record<string, { small: string; factor: number }> = {
  kg: { small: "g", factor: 1000 },
  l: { small: "ml", factor: 1000 },
  m: { small: "cm", factor: 100 },
};

export function WeightPad({
  mode,
  name,
  unit,
  price,
  initialQty,
  minQty,
  qtyStep,
  tare,
  currencySymbol,
  onConfirm,
  onClose,
}: {
  mode: "weight" | "quantity";
  name: string;
  unit: string; // the product's unit: kg/g/l/ml/m/cm, or each/pack… in quantity mode
  price: number; // per unit
  initialQty?: number;
  minQty?: number | null;
  qtyStep?: number | null;
  tare?: number | null;
  currencySymbol: string;
  onConfirm: (qty: number) => void;
  onClose: () => void;
}) {
  // Weights are typed in the small unit (g) by default — "734" is quicker than "0.734".
  const small = mode === "weight" ? SMALL_UNIT[unit] : undefined;
  const [inSmall, setInSmall] = useState(!!small);
  const [entry, setEntry] = useState(() => {
    if (initialQty == null) return "";
    if (small) return String(Math.round(initialQty * small.factor * 1000) / 1000);
    return String(initialQty);
  });
  const [useTare, setUseTare] = useState(!!tare);
  const [scaleMsg, setScaleMsg] = useState<string | null>(null);
  const [hasScale, setHasScale] = useState(false);
  useEffect(() => {
    if (mode === "weight") setTimeout(() => setHasScale(scaleConfigured()), 0);
  }, [mode]);

  const typed = Number(entry) || 0;
  let qty = small && inSmall ? typed / small.factor : typed;
  if (mode === "weight" && useTare && tare) qty = Math.max(0, qty - tare);
  if (mode === "weight" && qtyStep) qty = Math.round(qty / qtyStep) * qtyStep;
  qty = Math.round(qty * 1000) / 1000;
  const tooSmall = mode === "weight" && !!minQty && qty > 0 && qty < minQty;
  const valid = qty > 0 && qty <= (mode === "weight" ? 99.999 : 9999) && !tooSmall && (mode === "weight" || Number.isInteger(qty));
  const total = lineTotal({ price, qty });

  function press(key: string) {
    setEntry((prev) => {
      if (key === "back") return prev.slice(0, -1);
      if (key === "." && (prev.includes(".") || mode === "quantity")) return prev;
      if (prev.length >= 8) return prev;
      return prev === "0" && key !== "." ? key : prev + key;
    });
  }

  async function readScale() {
    setScaleMsg("Reading…");
    const result = await readScaleWeight();
    if ("error" in result) {
      setScaleMsg(result.error);
      return;
    }
    // Scales report kg; show it in whatever the pad is set to.
    const kg = result.kg;
    const inProductUnit = unit === "g" ? kg * 1000 : kg;
    setEntry(String(small && inSmall ? Math.round(inProductUnit * small.factor) : inProductUnit));
    setScaleMsg(result.stable ? null : "Weight wasn't stable — check it");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${mode === "weight" ? "Weight" : "Quantity"} for ${name}`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{name}</h2>
            <p className="text-sm text-neutral-500">
              {formatMoney(price, currencySymbol)} {mode === "weight" ? `per ${unit}` : unit !== "each" ? `per ${unit}` : "each"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2 rounded-xl border-2 border-[var(--brand)] px-4 py-3">
          <span className="flex-1 text-right font-mono text-3xl font-bold text-neutral-900" data-testid="pad-entry">
            {entry || "0"}
          </span>
          {small ? (
            <div className="flex rounded-lg border border-neutral-200 p-0.5 text-sm font-semibold">
              {[small.small, unit].map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    // Keep the same amount when switching g ↔ kg.
                    const nowSmall = u === small.small;
                    if (nowSmall !== inSmall && entry) setEntry(String(Math.round((nowSmall ? typed * small.factor : typed / small.factor) * 1000) / 1000));
                    setInSmall(nowSmall);
                  }}
                  className={`rounded-md px-2.5 py-1 ${(u === small.small) === inSmall ? "bg-[var(--brand)] text-white" : "text-neutral-500"}`}
                >
                  {u}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-lg font-semibold text-neutral-400">{mode === "weight" ? unit : "×"}</span>
          )}
        </div>

        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-neutral-500">
            {mode === "weight" ? `${qty} ${unit}` : `${qty} × ${formatMoney(price, currencySymbol)}`}
            {useTare && tare ? ` (tare ${tare} ${unit} off)` : ""}
          </span>
          <span className="text-xl font-bold text-neutral-900">{formatMoney(total, currencySymbol)}</span>
        </div>
        {tooSmall && <p className="mb-2 text-xs font-medium text-rose-600">The smallest sale is {minQty} {unit}.</p>}

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => press(k)}
              disabled={k === "." && mode === "quantity"}
              className="flex h-14 items-center justify-center rounded-xl border border-neutral-200 text-xl font-semibold text-neutral-800 hover:bg-neutral-50 active:scale-95 disabled:opacity-30"
              aria-label={k === "back" ? "Delete" : k}
            >
              {k === "back" ? <Delete className="h-5 w-5" /> : k}
            </button>
          ))}
        </div>

        {mode === "weight" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {!!tare && (
              <button
                type="button"
                onClick={() => setUseTare((v) => !v)}
                className={`rounded-lg border px-3 py-2 text-sm font-medium ${useTare ? "border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand-dark)]" : "border-neutral-200 text-neutral-500"}`}
              >
                Tare {tare} {unit}
              </button>
            )}
            {hasScale && (
              <button type="button" onClick={readScale} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
                <Scale className="h-4 w-4" /> Read scale
              </button>
            )}
            {scaleMsg && <span className="self-center text-xs text-amber-700">{scaleMsg}</span>}
          </div>
        )}

        <button
          type="button"
          disabled={!valid}
          onClick={() => onConfirm(qty)}
          className="mt-4 w-full rounded-xl bg-[var(--brand)] py-3.5 text-base font-bold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {initialQty != null ? "Update" : "Add"} · {formatMoney(total, currencySymbol)}
        </button>
      </div>
    </div>
  );
}
