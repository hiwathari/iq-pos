"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export interface Column<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
  // Value compared when sorting by this column — separate from render so a formatted display
  // string (e.g. "£12.00") doesn't get compared as text instead of by amount.
  sortValue?: (row: T) => string | number;
}

// A plain client-side table: every row is already in hand (a restaurant's daily order volume is
// small enough that sorting/filtering server-side would be needless round-trips), so clicking a
// header just re-sorts what's already rendered.
export function SortableTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  defaultSortKey,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyMessage: string;
  defaultSortKey?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    defaultSortKey ? { key: defaultSortKey, dir: "desc" } : null
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column) return rows;
    const valueOf = column.sortValue ?? ((row: T) => String(column.render(row)));
    const sorted = [...rows].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    return sort.dir === "desc" ? sorted.reverse() : sorted;
  }, [rows, sort, columns]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "desc" };
      return prev.dir === "desc" ? { key, dir: "asc" } : null;
    });
  }

  if (rows.length === 0) return <p className="text-sm text-neutral-400">{emptyMessage}</p>;

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-100">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.align === "right" ? "text-right" : "text-left"}>
                <button
                  onClick={() => toggleSort(c.key)}
                  className={`flex w-full items-center gap-1 px-4 py-2.5 hover:text-neutral-600 ${
                    c.align === "right" ? "justify-end" : ""
                  }`}
                >
                  {c.label}
                  {sort?.key === c.key ? (
                    sort.dir === "desc" ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUp className="h-3 w-3" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-30" />
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {sortedRows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-2.5 ${c.align === "right" ? "text-right" : ""}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
