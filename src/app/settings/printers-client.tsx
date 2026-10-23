"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bluetooth, Cable, Cloud, Monitor, Plus, Router, Star, Trash2, Wifi, X } from "lucide-react";
import {
  createPrinterAction,
  deletePrinterAction,
  saveLocalPrinterAction,
  setDefaultPrinterAction,
  setTillReceiptPrinterAction,
  togglePrinterActiveAction,
} from "@/lib/actions/printers";
import { saveSunmiPrinterSnAction, sendSunmiTestPrintAction } from "@/lib/actions/sunmi-print";
import { buildTicketEscPosAction } from "@/lib/actions/local-print";
import { printViaLocalBridge } from "@/lib/local-print-bridge";
import type { Printer, PrinterConnection, PrinterKind, PrinterStation } from "@/lib/types";

const STATIONS: PrinterStation[] = ["Kitchen", "Bar", "Receipt", "Expo"];
const CONNECTIONS: PrinterConnection[] = ["Bluetooth", "Network", "WiFi", "USB"];
const KIND_LABEL: Record<PrinterKind, string> = { printer: "Printer", display: "Display", both: "Printer + Display" };

const CONNECTION_ICON: Record<PrinterConnection, typeof Bluetooth> = {
  Bluetooth: Bluetooth,
  Network: Cable,
  WiFi: Wifi,
  USB: Cable,
};

// `restaurantId` is set when Super Admin → Printers renders this for a chosen restaurant (a super
// or regional admin isn't signed in to that restaurant); every action then targets it explicitly.
export function PrintersClient({ printers, restaurantId }: { printers: Printer[]; restaurantId?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);

  function toggle(id: string, active: boolean) {
    startTransition(async () => {
      await togglePrinterActiveAction(id, active, restaurantId);
      router.refresh();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deletePrinterAction(id, restaurantId);
      router.refresh();
    });
  }

  function makeDefault(id: string) {
    startTransition(async () => {
      await setDefaultPrinterAction(id, restaurantId);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">Printers &amp; Displays</h2>
          <p className="text-sm text-neutral-500">
            Register each physical printer once it&apos;s paired at the OS level (Bluetooth, network, or WiFi), and each
            dedicated Kitchen Display screen with its own PIN — a screen logged in with a display&apos;s own PIN defaults
            straight to that station instead of the generic &quot;All&quot; view.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]"
        >
          <Plus className="h-4 w-4" /> Add Printer / Display
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {printers.map((p) => {
          const Icon = p.kind === "display" ? Monitor : p.connection ? CONNECTION_ICON[p.connection] : Monitor;
          return (
            <div key={p.id} className="flex items-start justify-between rounded-2xl border border-neutral-200 bg-white p-4">
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-neutral-400" />
                  <span className="font-semibold text-neutral-900">{p.name}</span>
                </div>
                <div className="text-xs text-neutral-500">
                  {p.station} station &middot; {KIND_LABEL[p.kind as PrinterKind]}
                  {p.connection ? ` · ${p.connection}` : ""}
                  {p.address ? ` · ${p.address}` : ""}
                  {p.pin ? ` · PIN ${p.pin}` : ""}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {p.active ? "Active" : "Disabled"}
                  </span>
                  {p.isDefault && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      <Star className="h-3 w-3 fill-current" /> Default
                    </span>
                  )}
                </div>
                {p.kind !== "display" && (
                  <>
                    <LocalNetworkPrintRow printer={p} restaurantId={restaurantId} />
                    {/* Sunmi Cloud Print isn't in use (§7.7) and its actions need the restaurant's own session. */}
                    {!restaurantId && <SunmiCloudPrintRow printer={p} />}
                  </>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {!p.isDefault && (p.kind === "printer" || p.kind === "both") && (
                  <button
                    onClick={() => makeDefault(p.id)}
                    className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                  >
                    Set as default
                  </button>
                )}
                <button
                  onClick={() => toggle(p.id, !p.active)}
                  className="rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  {p.active ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-600 hover:bg-rose-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {printers.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-400">
            No printers or displays registered yet.
          </div>
        )}
      </div>

      {modalOpen && <AddPrinterModal restaurantId={restaurantId} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

// Inline per-printer local-network print control — raw ESC/POS over TCP:9100, the path that
// actually works without any vendor cloud account (see docs/DEVELOPER_GUIDE.md §7.7). Needs a
// small local bridge program running on the same network as the printer (public/downloads/iq-print-bridge.js)
// since the browser itself can't open the raw socket — Test Print exercises that whole chain.
function LocalNetworkPrintRow({ printer, restaurantId }: { printer: Printer; restaurantId?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(!printer.localPrinterIp);
  const [ip, setIp] = useState(printer.localPrinterIp ?? "");
  const [port, setPort] = useState(printer.localPrinterPort?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [testResult, setTestResult] = useState<"sent" | "error" | null>(null);

  function toggleTillReceiptPrinter(enabled: boolean) {
    setError(null);
    setPending(true);
    startTransition(async () => {
      const result = await setTillReceiptPrinterAction(printer.id, enabled, restaurantId);
      setPending(false);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function save() {
    setError(null);
    setPending(true);
    startTransition(async () => {
      const result = await saveLocalPrinterAction(printer.id, ip, port, restaurantId);
      setPending(false);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function sendTestPrint() {
    setTestResult(null);
    setError(null);
    setPending(true);
    startTransition(async () => {
      try {
        const { hex } = await buildTicketEscPosAction({
          restaurantName: "IQ POS",
          orderNumber: "TEST",
          createdAt: Date.now(),
          tableNumber: null,
          guests: null,
          channel: "Test Print",
          items: [{ categoryName: "Test", items: [{ name: "Test ticket", qty: 1, price: 0 }] }],
          subtotal: 0,
          tax: 0,
          total: 0,
          currencySymbol: "",
          footerText: "This is a test print from IQ POS Settings.",
        });
        await printViaLocalBridge({ printerIp: printer.localPrinterIp!, printerPort: printer.localPrinterPort, escposHex: hex });
        setTestResult("sent");
      } catch (err) {
        setTestResult("error");
        setError(err instanceof Error ? err.message : "Couldn't reach the local print bridge.");
      } finally {
        setPending(false);
      }
    });
  }

  if (!printer.localPrinterIp && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-neutral-600"
      >
        <Router className="h-3 w-3" /> Connect Local Network Print
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg bg-neutral-50 p-2">
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value.trim())}
            placeholder="Printer IP"
            className="w-24 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-teal-500"
          />
          <input
            value={port}
            onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
            placeholder="9100"
            inputMode="numeric"
            className="w-14 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-teal-500"
          />
          <button
            onClick={save}
            disabled={pending || !ip.trim()}
            className="rounded-md bg-[var(--brand)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
          {printer.localPrinterIp && (
            <button
              onClick={() => {
                setEditing(false);
                setIp(printer.localPrinterIp ?? "");
                setPort(printer.localPrinterPort?.toString() ?? "");
                setError(null);
              }}
              className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-500"
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-xs font-medium text-neutral-600">
              <Router className="h-3 w-3 text-teal-600" /> {printer.localPrinterIp}:{printer.localPrinterPort || 9100}
            </span>
            <div className="flex gap-1.5">
              <button onClick={sendTestPrint} disabled={pending} className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-white">
                Test Print
              </button>
              <button onClick={() => setEditing(true)} className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-white">
                Edit
              </button>
            </div>
          </div>
          <label className="mt-2 flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-2 py-1.5">
            <span className="text-xs font-medium text-neutral-600">
              Use for Till auto-print
              <span className="block text-[10px] font-normal text-neutral-400">
                On: the Till prints here, no browser dialog. Off: the Till keeps using the browser print popup.
              </span>
            </span>
            <input
              type="checkbox"
              checked={printer.tillReceiptPrinter}
              disabled={pending}
              onChange={(e) => toggleTillReceiptPrinter(e.target.checked)}
              className="h-4 w-4 shrink-0 accent-[var(--brand)]"
            />
          </label>
        </>
      )}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {testResult === "sent" && <p className="mt-1 text-xs text-emerald-600">Test ticket sent — check the printer.</p>}
      <p className="mt-1 text-[10px] text-neutral-400">Prints from the Till through the IQ POS Till app or the print bridge — see the printer setup kit.</p>
    </div>
  );
}

// Inline, always-visible per-printer Sunmi Cloud Print control — separate from the browser-print
// flow every printer already has by default (see lib/print-ticket.ts). Saving a SN here binds it
// with Sunmi directly (see saveSunmiPrinterSnAction), so a wrong/unregistered SN fails right here
// instead of silently sitting broken. See docs/DEVELOPER_GUIDE.md §8.3 for the full setup process
// — this UI alone doesn't make printing work until SUNMI_CLOUD_PRINT_APP_ID/APP_KEY are set and
// Sunmi's partner channel is actually enabled.
function SunmiCloudPrintRow({ printer }: { printer: Printer }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [sn, setSn] = useState(printer.sunmiSn ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [testResult, setTestResult] = useState<"sent" | "error" | null>(null);

  function save() {
    setError(null);
    setPending(true);
    startTransition(async () => {
      const result = await saveSunmiPrinterSnAction(printer.id, sn);
      setPending(false);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function sendTestPrint() {
    setTestResult(null);
    setPending(true);
    startTransition(async () => {
      const result = await sendSunmiTestPrintAction(printer.id);
      setPending(false);
      setTestResult(result?.error ? "error" : "sent");
      if (result?.error) setError(result.error);
    });
  }

  if (!printer.sunmiSn && !editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-neutral-400 hover:text-neutral-600"
      >
        <Cloud className="h-3 w-3" /> Connect Sunmi Cloud Print
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg bg-neutral-50 p-2">
      {editing ? (
        <div className="flex items-center gap-1.5">
          <input
            value={sn}
            onChange={(e) => setSn(e.target.value.trim())}
            placeholder="Printer SN"
            className="w-28 rounded-md border border-neutral-200 px-2 py-1 text-xs outline-none focus:border-teal-500"
          />
          <button
            onClick={save}
            disabled={pending}
            className="rounded-md bg-[var(--brand)] px-2 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setSn(printer.sunmiSn ?? "");
              setError(null);
            }}
            className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-500"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1 text-xs font-medium text-neutral-600">
            <Cloud className="h-3 w-3 text-teal-600" /> Sunmi SN {printer.sunmiSn}
          </span>
          <div className="flex gap-1.5">
            <button onClick={sendTestPrint} disabled={pending} className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-white">
              Test Print
            </button>
            <button onClick={() => setEditing(true)} className="rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-white">
              Edit
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      {testResult === "sent" && <p className="mt-1 text-xs text-emerald-600">Test ticket sent — check the printer.</p>}
    </div>
  );
}

function AddPrinterModal({ onClose, restaurantId }: { onClose: () => void; restaurantId?: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [station, setStation] = useState<PrinterStation>("Kitchen");
  const [kind, setKind] = useState<PrinterKind>("printer");
  const [connection, setConnection] = useState<PrinterConnection>("Network");
  const [address, setAddress] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const needsConnection = kind !== "display";
  const needsPin = kind !== "printer";

  function save() {
    if (!name.trim()) return;
    setError(null);
    setPending(true);
    startTransition(async () => {
      const result = await createPrinterAction({
        name,
        station,
        kind,
        connection: needsConnection ? connection : undefined,
        address: needsConnection ? address : undefined,
        pin: needsPin ? pin : undefined,
      }, restaurantId);
      setPending(false);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">Add Printer / Display</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">This entry is a</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(["printer", "display", "both"] as PrinterKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-lg border px-2 py-2 text-xs font-semibold ${
                    kind === k ? "border-[var(--brand)] bg-[var(--brand-light)] text-[var(--brand-dark)]" : "border-neutral-200 text-neutral-500"
                  }`}
                >
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={needsPin ? "e.g. Bar Screen" : "e.g. Kitchen Line 1"}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-neutral-500">Station</label>
            <select
              value={station}
              onChange={(e) => setStation(e.target.value as PrinterStation)}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            >
              {STATIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {needsConnection && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-500">Connection</label>
                <select
                  value={connection}
                  onChange={(e) => setConnection(e.target.value as PrinterConnection)}
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                >
                  {CONNECTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-neutral-500">
                  {connection === "Network" || connection === "WiFi" ? "IP address (optional)" : "Address / MAC (optional)"}
                </label>
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="192.168.1.42"
                  className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                />
              </div>
            </div>
          )}
          {needsPin && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-neutral-500">Display PIN (6 digits)</label>
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                placeholder="e.g. 482913"
                className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
              <p className="mt-1 text-xs text-neutral-400">
                Entered at /kitchen-login to log this specific screen straight into its own station. Must be different from
                every other display&apos;s PIN and every staff member&apos;s own PIN.
              </p>
            </div>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim() || pending || (needsPin && pin.length !== 6)}
            className="flex-1 rounded-xl bg-[var(--brand)] py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
