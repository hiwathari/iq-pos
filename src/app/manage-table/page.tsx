"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { useStore } from "@/lib/store";
import type { RestaurantTable, TableArea, TableStatus } from "@/lib/types";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Plus,
  Phone,
  Users,
  Armchair,
  X,
} from "lucide-react";

const AREAS: TableArea[] = ["Main Dining", "Terrace", "Outdoor"];

const STATUS_META: Record<TableStatus, { label: string; dot: string; card: string; text: string }> = {
  available: { label: "Available", dot: "bg-indigo-400", card: "bg-indigo-50 border-indigo-100", text: "text-indigo-700" },
  reserved: { label: "Reserved", dot: "bg-orange-400", card: "bg-orange-50 border-orange-200", text: "text-orange-700" },
  "on-dine": { label: "On Dine", dot: "bg-teal-500", card: "bg-teal-50 border-teal-200", text: "text-teal-700" },
};

const RES_STATUS_META: Record<string, { label: string; className: string }> = {
  upcoming: { label: "Upcoming", className: "bg-teal-50 text-teal-700" },
  "on-dine": { label: "On Dine", className: "bg-orange-100 text-orange-700" },
  paid: { label: "Payment", className: "bg-emerald-50 text-emerald-700" },
  unpaid: { label: "Unpaid", className: "bg-rose-50 text-rose-600" },
  available: { label: "Free", className: "bg-neutral-100 text-neutral-500" },
};

export default function ManageTablePage() {
  const { tables, reservations, setTableStatus, addReservation, setCartTable } = useStore();
  const router = useRouter();

  const [area, setArea] = useState<TableArea>("Main Dining");
  const [query, setQuery] = useState("");
  const [resFilter, setResFilter] = useState<"All" | "Reservation" | "On Dine">("All");
  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);

  const areaTables = useMemo(() => tables.filter((t) => t.area === area), [tables, area]);

  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      const matchesQuery = r.customerName.toLowerCase().includes(query.toLowerCase());
      const matchesFilter =
        resFilter === "All" ||
        (resFilter === "Reservation" && (r.status === "upcoming" || r.status === "paid" || r.status === "unpaid")) ||
        (resFilter === "On Dine" && r.status === "on-dine");
      return matchesQuery && matchesFilter;
    });
  }, [reservations, query, resFilter]);

  function goOrderForTable(table: RestaurantTable) {
    setCartTable(table.id, table.number, Math.max(1, table.seated || 1));
    router.push("/order-line");
  }

  return (
    <AppShell title="Manage Table">
      <div className="flex h-full min-h-0">
        {/* Reservation list */}
        <div className="flex w-80 shrink-0 flex-col border-r border-neutral-200 bg-white p-5">
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-neutral-200 p-1 text-sm">
            {(["All", "Reservation", "On Dine"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setResFilter(tab)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                  resFilter === tab ? "bg-teal-600 text-white" : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="mb-4 flex items-center justify-between text-sm text-neutral-500">
            <button className="rounded-full border border-neutral-200 p-1.5 hover:bg-neutral-50">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-medium text-neutral-700">Thu, 11 January 2024</span>
            <button className="rounded-full border border-neutral-200 p-1.5 hover:bg-neutral-50">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search customers"
                className="w-full rounded-xl border border-neutral-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <button className="rounded-xl border border-neutral-200 p-2.5 text-neutral-500 hover:bg-neutral-50">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {filteredReservations.map((r) => {
              const meta = RES_STATUS_META[r.status];
              return (
                <div key={r.id} className="rounded-xl border border-neutral-200 p-3.5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <span className={`mb-1 inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
                        {r.status === "available" ? "Free" : r.time}
                      </span>
                      <div className="text-sm font-semibold text-neutral-800">{r.customerName}</div>
                    </div>
                    <span className="text-xs text-neutral-400">{r.meal}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span className="flex items-center gap-1">
                      <Armchair className="h-3.5 w-3.5" /> {r.tableNumber ?? "-"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" /> {r.guests}
                    </span>
                    <span className={`rounded-md px-1.5 py-0.5 font-medium ${meta.className}`}>{meta.label}</span>
                  </div>
                  {r.phone && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-neutral-400">
                      <Phone className="h-3.5 w-3.5" /> {r.phone}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredReservations.length === 0 && (
              <div className="py-10 text-center text-sm text-neutral-400">No reservations found.</div>
            )}
          </div>

          <button
            onClick={() => setReservationModalOpen(true)}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" /> Add New Reservation
          </button>
        </div>

        {/* Floor plan */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold text-neutral-900">Manage Tables</h1>
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1">
              {AREAS.map((a) => (
                <button
                  key={a}
                  onClick={() => setArea(a)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    area === a ? "bg-teal-600 text-white" : "text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6 flex items-center gap-5 text-sm text-neutral-500">
            {(Object.keys(STATUS_META) as TableStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_META[s].dot}`} />
                {STATUS_META[s].label}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
            {areaTables.map((table) => {
              const meta = STATUS_META[table.status];
              return (
                <div key={table.id} className="relative flex flex-col items-center">
                  <div className="mb-1 flex gap-1.5">
                    {Array.from({ length: Math.min(4, Math.ceil(table.capacity / 2)) }).map((_, i) => (
                      <Armchair key={i} className="h-4 w-4 text-neutral-300" />
                    ))}
                  </div>
                  <button
                    onClick={() => setOpenTableId(openTableId === table.id ? null : table.id)}
                    className={`flex h-24 w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 transition-transform hover:scale-[1.02] ${meta.card}`}
                  >
                    <span className={`text-sm font-semibold ${meta.text}`}>Table #{table.number}</span>
                    <span className={`flex items-center gap-1 text-xs ${meta.text}`}>
                      <Users className="h-3.5 w-3.5" /> {table.status === "available" ? 0 : table.seated}
                    </span>
                  </button>
                  <div className="mt-1 flex gap-1.5">
                    {Array.from({ length: Math.floor(table.capacity / 2) }).map((_, i) => (
                      <Armchair key={i} className="h-4 w-4 text-neutral-300" />
                    ))}
                  </div>

                  {openTableId === table.id && (
                    <div className="absolute top-20 z-20 w-52 rounded-xl border border-neutral-200 bg-white p-3 shadow-lg">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-semibold text-neutral-800">Table #{table.number}</span>
                        <button onClick={() => setOpenTableId(null)} className="text-neutral-400 hover:text-neutral-600">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mb-3 text-xs text-neutral-400">Capacity: {table.capacity} guests</div>
                      <div className="mb-3 space-y-1.5">
                        {(Object.keys(STATUS_META) as TableStatus[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => {
                              setTableStatus(table.id, s, s === "available" ? 0 : table.capacity);
                              setOpenTableId(null);
                            }}
                            className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium ${
                              table.status === s ? "bg-neutral-100" : "hover:bg-neutral-50"
                            }`}
                          >
                            <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />
                            Mark as {STATUS_META[s].label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => goOrderForTable(table)}
                        className="w-full rounded-lg bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                      >
                        Start Order →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {reservationModalOpen && (
        <AddReservationModal
          onClose={() => setReservationModalOpen(false)}
          tables={tables}
          onSave={(r) => {
            addReservation(r);
            setReservationModalOpen(false);
          }}
        />
      )}
    </AppShell>
  );
}

function AddReservationModal({
  onClose,
  tables,
  onSave,
}: {
  onClose: () => void;
  tables: RestaurantTable[];
  onSave: (r: {
    customerName: string;
    phone?: string;
    time: string;
    date: string;
    tableId: string | null;
    tableNumber: number | null;
    guests: number;
    status: "upcoming";
    meal: "Breakfast" | "Lunch" | "Dinner";
  }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [time, setTime] = useState("7:00 PM");
  const [guests, setGuests] = useState(2);
  const [meal, setMeal] = useState<"Breakfast" | "Lunch" | "Dinner">("Dinner");
  const [tableId, setTableId] = useState("");

  const canSave = name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Add New Reservation</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Customer Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 555 000 000"
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Time</label>
              <input
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Guests</label>
              <input
                type="number"
                min={1}
                value={guests}
                onChange={(e) => setGuests(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Meal</label>
              <select
                value={meal}
                onChange={(e) => setMeal(e.target.value as typeof meal)}
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option>Breakfast</option>
                <option>Lunch</option>
                <option>Dinner</option>
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Table</label>
              <select
                value={tableId}
                onChange={(e) => setTableId(e.target.value)}
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              >
                <option value="">Unassigned</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>
                    Table {t.number} ({t.area})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={() => {
              const table = tables.find((t) => t.id === tableId);
              onSave({
                customerName: name.trim(),
                phone: phone.trim() || undefined,
                time,
                date: "2026-08-16",
                tableId: table?.id ?? null,
                tableNumber: table?.number ?? null,
                guests,
                status: "upcoming",
                meal,
              });
            }}
            className="flex-1 rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save Reservation
          </button>
        </div>
      </div>
    </div>
  );
}
