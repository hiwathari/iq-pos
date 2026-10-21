"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Reservation, ReservationSource, RestaurantTable, TableArea, TableStatus } from "@/lib/types";
import {
  freeTablesAction,
  setTableStatusAction,
  createReservationAction,
  createTableAction,
  deleteTableAction,
  type ReservationInput,
  type CreateTableState,
} from "@/lib/actions/tables";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Plus,
  Phone,
  Users,
  Armchair,
  Trash2,
  X,
  Globe,
  QrCode,
  Download,
  Printer,
  AlertTriangle,
} from "lucide-react";
import { downloadDataUrl, printTableQrCards, tableQrCardDataUrl } from "@/lib/table-qr";

const AREAS: TableArea[] = ["Ground Floor", "1st Floor", "Basement"];

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

export function ManageTableClient({
  tables,
  reservations,
  restaurantName,
  tableQrPaths,
  qrTableOrderingEnabled,
}: {
  tables: RestaurantTable[];
  reservations: Reservation[];
  restaurantName: string;
  // tableId → signed ordering path (/order/<slug>/table/<token>), signed server-side.
  tableQrPaths: Record<string, string>;
  qrTableOrderingEnabled: boolean;
}) {
  const router = useRouter();
  const [qrForTable, setQrForTable] = useState<RestaurantTable | null>(null);
  const [allQrOpen, setAllQrOpen] = useState(false);
  const [, startTransition] = useTransition();

  const [area, setArea] = useState<TableArea>("Ground Floor");
  const [query, setQuery] = useState("");
  const [resFilter, setResFilter] = useState<"All" | "Reservation" | "On Dine">("All");
  const [openTableId, setOpenTableId] = useState<string | null>(null);
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [addTableModalOpen, setAddTableModalOpen] = useState(false);

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
    router.push(`/order-line?tableId=${table.id}&tableNumber=${table.number}`);
  }

  function handleSetStatus(tableId: string, status: TableStatus, seated: number) {
    setOpenTableId(null);
    startTransition(async () => {
      await setTableStatusAction(tableId, status, seated);
      router.refresh();
    });
  }

  function handleAddReservation(input: ReservationInput) {
    startTransition(async () => {
      await createReservationAction(input);
      router.refresh();
    });
    setReservationModalOpen(false);
  }

  function handleDeleteTable(tableId: string) {
    setOpenTableId(null);
    startTransition(async () => {
      await deleteTableAction(tableId);
      router.refresh();
    });
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Reservation list */}
      <div className="flex w-80 shrink-0 flex-col border-r border-neutral-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-neutral-200 p-1 text-sm">
          {(["All", "Reservation", "On Dine"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setResFilter(tab)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
                resFilter === tab ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"
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
                  <span className="flex items-center gap-1 text-xs text-neutral-400">
                    {r.source !== "walk-in" && (
                      <span className="flex items-center gap-0.5 rounded bg-neutral-100 px-1.5 py-0.5 capitalize text-neutral-500">
                        {r.source === "online" ? <Globe className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                        {r.source}
                      </span>
                    )}
                    {r.meal}
                  </span>
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
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          <Plus className="h-4 w-4" /> Add New Reservation
        </button>
      </div>

      {/* Floor plan */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-neutral-900">Manage Tables</h1>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-neutral-200 bg-white p-1">
              {AREAS.map((a) => (
                <button
                  key={a}
                  onClick={() => setArea(a)}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    area === a ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            {tables.some((t) => t.status !== "available") && (
              <button
                onClick={() => {
                  const busy = tables.filter((t) => t.status !== "available").length;
                  if (!window.confirm(`Free all ${busy} occupied/reserved table${busy === 1 ? "" : "s"} in every area? Open orders stay in the Till's Tickets.`)) return;
                  startTransition(async () => {
                    await freeTablesAction();
                    router.refresh();
                  });
                }}
                className="flex items-center gap-2 whitespace-nowrap rounded-xl border border-rose-200 bg-white px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"
              >
                <X className="h-4 w-4" /> Free all tables
              </button>
            )}
            <button
              onClick={() => setAllQrOpen(true)}
              className="flex items-center gap-2 whitespace-nowrap rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            >
              <QrCode className="h-4 w-4" /> Table QR Codes
            </button>
            <button
              onClick={() => setAddTableModalOpen(true)}
              className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
            >
              <Plus className="h-4 w-4" /> Add Table
            </button>
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
                <button
                  onClick={() => setQrForTable(table)}
                  title={`Table ${table.number} QR code`}
                  aria-label={`Table ${table.number} QR code`}
                  className="absolute right-1.5 top-7 flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 shadow-sm hover:text-[var(--brand-dark)]"
                >
                  <QrCode className="h-4 w-4" />
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
                          onClick={() => handleSetStatus(table.id, s, s === "available" ? 0 : table.capacity)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium ${
                            table.status === s ? "bg-neutral-100" : "hover:bg-neutral-50"
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${STATUS_META[s].dot}`} />
                          Mark as {STATUS_META[s].label}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => goOrderForTable(table)}
                        className="flex-1 rounded-lg bg-[var(--brand)] py-2 text-xs font-semibold text-white hover:bg-[var(--brand-dark)]"
                      >
                        Start Order →
                      </button>
                      <button
                        onClick={() => {
                          setQrForTable(table);
                          setOpenTableId(null);
                        }}
                        title="Table QR code for ordering"
                        className="flex items-center justify-center rounded-lg border border-neutral-200 px-2.5 text-neutral-500 hover:bg-neutral-50"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteTable(table.id)}
                        title="Delete table"
                        className="flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-rose-600 hover:bg-rose-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {reservationModalOpen && (
        <AddReservationModal onClose={() => setReservationModalOpen(false)} tables={tables} onSave={handleAddReservation} />
      )}
      {addTableModalOpen && <AddTableModal onClose={() => setAddTableModalOpen(false)} defaultArea={area} />}
      {qrForTable && (
        <TableQrModal
          table={qrForTable}
          path={tableQrPaths[qrForTable.id]}
          restaurantName={restaurantName}
          enabled={qrTableOrderingEnabled}
          onClose={() => setQrForTable(null)}
        />
      )}
      {allQrOpen && (
        <AllTablesQrModal
          tables={tables}
          paths={tableQrPaths}
          restaurantName={restaurantName}
          enabled={qrTableOrderingEnabled}
          onClose={() => setAllQrOpen(false)}
        />
      )}
    </div>
  );
}

// The brand colour comes from the --brand CSS variable AppShell sets, so the printed cards match
// the restaurant's own colour.
function useBrandColor(ref: React.RefObject<HTMLElement | null>) {
  const [color, setColor] = useState<string | null>(null);
  useEffect(() => {
    if (ref.current) setColor(getComputedStyle(ref.current).getPropertyValue("--brand").trim() || "#0d9488");
  }, [ref]);
  return color;
}

function QrDisabledNotice() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-left text-xs text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      Table QR ordering is switched off for this restaurant, so scanning shows &ldquo;unavailable&rdquo; until it&apos;s turned on
      (Super Admin → Online Ordering). You can still print the codes now — they won&apos;t change.
    </div>
  );
}

function TableQrModal({
  table,
  path,
  restaurantName,
  enabled,
  onClose,
}: {
  table: RestaurantTable;
  path: string | undefined;
  restaurantName: string;
  enabled: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const brandColor = useBrandColor(ref);
  const [card, setCard] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" && path ? `${window.location.origin}${path}` : "";

  useEffect(() => {
    let cancelled = false;
    if (url && brandColor) {
      tableQrCardDataUrl({ url, restaurantName, tableNumber: table.number, brandColor }).then((v) => !cancelled && setCard(v));
    }
    return () => {
      cancelled = true;
    };
  }, [url, brandColor, restaurantName, table.number]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div ref={ref} className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Table {table.number} QR</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        {!enabled && <QrDisabledNotice />}
        {card ? (
          <img src={card} alt={`Table ${table.number} order QR`} className="mx-auto mb-4 w-56 rounded-lg border border-neutral-100" />
        ) : (
          <div className="mx-auto mb-4 flex h-72 w-56 items-center justify-center text-sm text-neutral-400">Generating…</div>
        )}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <button
            disabled={!card}
            onClick={() => card && downloadDataUrl(card, `table-${table.number}-qr.png`)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download
          </button>
          <button
            disabled={!card}
            onClick={() => card && printTableQrCards([{ tableNumber: table.number, dataUrl: card }], `Table ${table.number} QR`)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="mb-3 w-full rounded-xl border border-neutral-200 py-2 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
        >
          {copied ? "Link copied!" : "Copy link"}
        </button>
        <p className="text-xs text-neutral-400">
          Stick this on Table {table.number}. Scanning opens the menu with this table already set — the table is locked into the
          code, so it can&apos;t be changed to another table. Customers just add their name and email or phone to order.
        </p>
      </div>
    </div>
  );
}

function AllTablesQrModal({
  tables,
  paths,
  restaurantName,
  enabled,
  onClose,
}: {
  tables: RestaurantTable[];
  paths: Record<string, string>;
  restaurantName: string;
  enabled: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const brandColor = useBrandColor(ref);
  const sorted = useMemo(() => [...tables].sort((a, b) => a.number - b.number), [tables]);
  const [cards, setCards] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!brandColor) return;
    let cancelled = false;
    (async () => {
      for (const t of sorted) {
        const path = paths[t.id];
        if (!path) continue;
        const dataUrl = await tableQrCardDataUrl({ url: `${window.location.origin}${path}`, restaurantName, tableNumber: t.number, brandColor });
        if (cancelled) return;
        if (dataUrl) setCards((prev) => ({ ...prev, [t.id]: dataUrl }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [brandColor, sorted, paths, restaurantName]);

  const ready = sorted.filter((t) => cards[t.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        ref={ref}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Table QR Codes</h2>
            <p className="text-xs text-neutral-400">One code per table, with the table number locked in. Download one, or print them all.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={ready.length === 0}
              onClick={() =>
                printTableQrCards(
                  ready.map((t) => ({ tableNumber: t.number, dataUrl: cards[t.id] })),
                  `${restaurantName} table QR codes`
                )
              }
              className="flex items-center gap-1.5 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
            >
              <Printer className="h-4 w-4" /> Print / Save all as PDF
            </button>
            <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {!enabled && <QrDisabledNotice />}
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
          {sorted.map((t) => (
            <div key={t.id} className="flex flex-col items-center rounded-xl border border-neutral-200 p-3">
              {cards[t.id] ? (
                <img src={cards[t.id]} alt={`Table ${t.number} QR`} className="mb-2 w-full rounded-md" />
              ) : (
                <div className="mb-2 flex aspect-[4/5] w-full items-center justify-center text-xs text-neutral-400">Generating…</div>
              )}
              <button
                disabled={!cards[t.id]}
                onClick={() => downloadDataUrl(cards[t.id], `table-${t.number}-qr.png`)}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
              >
                <Download className="h-3.5 w-3.5" /> Table {t.number}
              </button>
            </div>
          ))}
          {sorted.length === 0 && <div className="col-span-full py-10 text-center text-sm text-neutral-400">No tables yet — add one first.</div>}
        </div>
      </div>
    </div>
  );
}

const initialCreateTableState: CreateTableState = {};

function AddTableModal({ onClose, defaultArea }: { onClose: () => void; defaultArea: TableArea }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createTableAction, initialCreateTableState);
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      router.refresh();
      onClose();
    }
    wasPending.current = pending;
  }, [pending, state, onClose, router]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Add Table</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form ref={formRef} action={formAction} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Table Number</label>
            <input
              name="number"
              type="number"
              min={1}
              required
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Area</label>
            <select
              name="area"
              defaultValue={defaultArea}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Capacity (seats)</label>
            <input
              name="capacity"
              type="number"
              min={1}
              defaultValue={4}
              required
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>

          {state?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{state.error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add Table"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AddReservationModal({
  onClose,
  tables,
  onSave,
}: {
  onClose: () => void;
  tables: RestaurantTable[];
  onSave: (r: ReservationInput) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [time, setTime] = useState("7:00 PM");
  const [guests, setGuests] = useState(2);
  const [meal, setMeal] = useState<"Breakfast" | "Lunch" | "Dinner">("Dinner");
  const [tableId, setTableId] = useState("");
  const [source, setSource] = useState<ReservationSource>("walk-in");

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
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Booked Via</label>
            <div className="grid grid-cols-3 gap-2">
              {(["walk-in", "phone", "online"] as ReservationSource[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium capitalize ${
                    source === s ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 text-neutral-500"
                  }`}
                >
                  {s}
                </button>
              ))}
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
                meal,
                source,
              });
            }}
            className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save Reservation
          </button>
        </div>
      </div>
    </div>
  );
}
