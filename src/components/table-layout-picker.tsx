"use client";

import { useMemo, useState } from "react";
import { Armchair, Users, X } from "lucide-react";
import type { RestaurantTable, TableArea } from "@/lib/types";

const AREAS: TableArea[] = ["Main Dining", "Terrace", "Outdoor"];

const STATUS_DOT: Record<RestaurantTable["status"], string> = {
  available: "bg-indigo-400",
  reserved: "bg-orange-400",
  "on-dine": "bg-teal-500",
};

const STATUS_CARD: Record<RestaurantTable["status"], string> = {
  available: "bg-indigo-50 border-indigo-200 hover:border-indigo-400",
  reserved: "bg-orange-50 border-orange-200 hover:border-orange-400",
  "on-dine": "bg-teal-50 border-teal-200",
};

// The visual floor-plan table picker used from the Till when starting a Dine-in order —
// same layout language as Manage Table, but for selection rather than status management.
export function TableLayoutPicker({
  tables,
  selectedTableId,
  onSelect,
  onClose,
}: {
  tables: RestaurantTable[];
  selectedTableId: string | null;
  onSelect: (table: RestaurantTable) => void;
  onClose: () => void;
}) {
  const [area, setArea] = useState<TableArea>("Main Dining");
  const areaTables = useMemo(() => tables.filter((t) => t.area === area), [tables, area]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Select a Table</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-1">
          {AREAS.map((a) => (
            <button
              key={a}
              onClick={() => setArea(a)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                area === a ? "bg-teal-600 text-white" : "text-neutral-500 hover:bg-white"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="mb-4 flex items-center gap-5 text-xs text-neutral-500">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-indigo-400" /> Available
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> Reserved
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-500" /> On Dine
          </span>
        </div>

        <div className="grid flex-1 grid-cols-3 gap-4 overflow-y-auto pb-1 sm:grid-cols-4">
          {areaTables.map((table) => {
            const isSelected = table.id === selectedTableId;
            const isOccupied = table.status === "on-dine" && !isSelected;
            return (
              <button
                key={table.id}
                disabled={isOccupied}
                onClick={() => onSelect(table)}
                className={`flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 transition-transform ${
                  STATUS_CARD[table.status]
                } ${isSelected ? "ring-2 ring-teal-500" : ""} ${
                  isOccupied ? "cursor-not-allowed opacity-50" : "hover:scale-[1.03]"
                }`}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[table.status]}`} />
                  Table #{table.number}
                </span>
                <span className="flex items-center gap-1 text-xs text-neutral-500">
                  <Armchair className="h-3 w-3" /> {table.capacity}
                  {table.status === "on-dine" && (
                    <span className="ml-1 flex items-center gap-0.5">
                      <Users className="h-3 w-3" /> {table.seated}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
          {areaTables.length === 0 && (
            <div className="col-span-full py-10 text-center text-sm text-neutral-400">No tables in this area.</div>
          )}
        </div>
      </div>
    </div>
  );
}
