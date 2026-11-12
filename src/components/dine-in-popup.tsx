"use client";

import { useMemo, useState } from "react";
import { Armchair, Combine, Minus, Plus, Users, X } from "lucide-react";
import { FloorLabel } from "@/components/floor-icons";
import type { Order, RestaurantTable } from "@/lib/types";

const STATUS_CARD: Record<RestaurantTable["status"], string> = {
  available: "border-indigo-200 bg-indigo-50 hover:border-indigo-400",
  reserved: "border-orange-200 bg-orange-50 hover:border-orange-400",
  "on-dine": "border-teal-200 bg-teal-50",
};

export interface DineInChoice {
  tableId: string;
  tableNumber: number;
  guests: number;
  // Other tables pushed together for this one order (ids to save, numbers to show).
  mergedTableIds: string[];
  mergedTableNumbers: number[];
}

// What the Till shows when "Dine in" is tapped: pick a table on its floor, say how many guests are
// seated, and — for a big party — merge more tables into this one order. A table that already has
// an open order opens that order instead (onOpenOrder).
export function DineInPopup({
  floors,
  tables,
  activeOrderForTable,
  initial,
  onConfirm,
  onOpenOrder,
  onClose,
}: {
  floors: string[];
  tables: RestaurantTable[];
  activeOrderForTable: (table: RestaurantTable) => Order | undefined;
  initial: { tableId: string | null; guests: number; mergedTableIds: string[] };
  onConfirm: (choice: DineInChoice) => void;
  onOpenOrder: (order: Order) => void;
  onClose: () => void;
}) {
  const firstChosen = tables.find((t) => t.id === initial.tableId);
  const [chosenArea, setArea] = useState<string>(firstChosen?.area ?? floors[0] ?? "Ground Floor");
  const area = floors.includes(chosenArea) ? chosenArea : (floors[0] ?? "Ground Floor");
  const [primaryId, setPrimaryId] = useState<string | null>(initial.tableId);
  const [extraIds, setExtraIds] = useState<string[]>(initial.mergedTableIds);
  const [mergeMode, setMergeMode] = useState(initial.mergedTableIds.length > 0);
  const [guests, setGuests] = useState(Math.max(1, initial.guests));

  const areaTables = useMemo(() => tables.filter((t) => t.area === area).sort((a, b) => a.number - b.number), [tables, area]);
  const primary = tables.find((t) => t.id === primaryId) ?? null;
  const extras = extraIds.map((id) => tables.find((t) => t.id === id)).filter((t): t is RestaurantTable => !!t);
  const seats = [primary, ...extras].reduce((sum, t) => sum + (t?.capacity ?? 0), 0);

  function tap(table: RestaurantTable) {
    const open = activeOrderForTable(table);
    if (open) {
      onOpenOrder(open);
      return;
    }
    if (mergeMode && primary && table.id !== primary.id) {
      setExtraIds((ids) => (ids.includes(table.id) ? ids.filter((x) => x !== table.id) : [...ids, table.id]));
      return;
    }
    setPrimaryId(table.id);
    setExtraIds([]);
    // Start the guest count at the table's seats when it is smaller than the current count.
    setGuests((g) => Math.min(g, Math.max(1, table.capacity)));
  }

  const label = [primary, ...extras].map((t) => (t ? `Table ${String(t.number).padStart(2, "0")}` : "")).filter(Boolean).join(" + ");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-3" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Dine in — choose a table</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2 overflow-x-auto rounded-xl border border-neutral-200 bg-neutral-50 p-1 [scrollbar-width:none]">
          {floors.map((f) => (
            <button
              key={f}
              onClick={() => setArea(f)}
              className={`min-h-11 shrink-0 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${area === f ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-white"}`}
            >
              <FloorLabel name={f} className="h-5 w-5" />
            </button>
          ))}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-indigo-400" /> Available</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> Reserved</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-teal-500" /> On Dine — tap to open its order</span>
          <button
            type="button"
            onClick={() => {
              if (mergeMode) setExtraIds([]);
              setMergeMode((m) => !m);
            }}
            disabled={!primary}
            className={`ml-auto flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${
              mergeMode ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
            }`}
            title={primary ? "Tap more free tables to join them to this order" : "Pick a table first"}
          >
            <Combine className="h-4 w-4" /> Merge tables
          </button>
        </div>
        {mergeMode && <p className="mb-2 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700">Tap other free tables to join them to {primary ? `Table ${String(primary.number).padStart(2, "0")}` : "this order"}. Tap one again to take it off.</p>}

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-100/60 p-3">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
            {areaTables.map((table) => {
              const open = activeOrderForTable(table);
              const isPrimary = table.id === primaryId;
              const isExtra = extraIds.includes(table.id);
              return (
                <button
                  key={table.id}
                  onClick={() => tap(table)}
                  aria-label={`Table ${table.number}`}
                  className={`relative flex min-h-[92px] flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 text-center transition active:scale-[0.97] ${
                    open ? STATUS_CARD["on-dine"] : STATUS_CARD[table.status]
                  } ${isPrimary ? "!border-[var(--brand)] ring-2 ring-[var(--brand)]" : ""} ${isExtra ? "!border-[var(--brand)] border-dashed ring-2 ring-[var(--brand)]/60" : ""}`}
                >
                  <span className="text-base font-bold text-neutral-800">Table {String(table.number).padStart(2, "0")}</span>
                  <span className="flex items-center gap-1 text-xs text-neutral-500">
                    <Armchair className="h-3.5 w-3.5" /> {table.capacity} seats
                  </span>
                  {open && <span className="text-[11px] font-semibold text-teal-700">#{open.orderNumber} · open</span>}
                  {isPrimary && <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-bold text-white">Selected</span>}
                  {isExtra && <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--brand)] px-1.5 py-0.5 text-[10px] font-bold text-white">Merged</span>}
                </button>
              );
            })}
            {areaTables.length === 0 && <div className="col-span-full py-10 text-center text-sm text-neutral-400">No tables on this floor.</div>}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-neutral-900">{label || "No table chosen yet"}</div>
            <div className="text-xs text-neutral-500">
              {primary ? `Seats ${seats}` : "Tap a table above"}
              {primary && guests > seats && <span className="ml-1.5 font-semibold text-amber-600">· more guests than seats</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-neutral-400" />
            <button type="button" onClick={() => setGuests((g) => Math.max(1, g - 1))} aria-label="Fewer guests" className="flex h-11 w-11 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50 active:scale-95">
              <Minus className="h-5 w-5" />
            </button>
            <div className="w-10 text-center text-xl font-semibold text-neutral-900" aria-label="Guests">{guests}</div>
            <button type="button" onClick={() => setGuests((g) => g + 1)} aria-label="More guests" className="flex h-11 w-11 items-center justify-center rounded-lg bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)] active:scale-95">
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <button
            disabled={!primary}
            onClick={() =>
              primary &&
              onConfirm({
                tableId: primary.id,
                tableNumber: primary.number,
                guests,
                mergedTableIds: extras.map((t) => t.id),
                mergedTableNumbers: extras.map((t) => t.number),
              })
            }
            className="min-h-11 rounded-xl bg-[var(--brand)] px-6 py-2.5 text-base font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button key={n} type="button" onClick={() => setGuests(n)} className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold ${guests === n ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"}`}>
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
