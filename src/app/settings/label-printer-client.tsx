"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tags } from "lucide-react";
import { updateLabelPrinterAction } from "@/lib/actions/restaurants";
import { buildLabelJob, cleanLabelPrinter, DEFAULT_LABEL_PRINTER, testLabel, type LabelPrinterConfig } from "@/lib/label-printer";
import { printViaLocalBridge } from "@/lib/local-print-bridge";

// Settings → Label printer (docs/retail-plan step 7.3): a Zebra (ZPL) or TSC / Xprinter-style
// (TSPL) network label printer on port 9100, reached through the same print bridge as the receipt
// printer. Product labels and bin labels then get a "Send to label printer" button.
export function LabelPrinterClient({ config }: { config: LabelPrinterConfig | null }) {
  const router = useRouter();
  const start = config ?? DEFAULT_LABEL_PRINTER;
  const [ip, setIp] = useState(config?.ip ?? "");
  const [port, setPort] = useState(String(start.port ?? 9100));
  const [language, setLanguage] = useState(start.language);
  const [widthMm, setWidth] = useState(String(start.widthMm));
  const [heightMm, setHeight] = useState(String(start.heightMm));
  const [dpi, setDpi] = useState(String(start.dpi));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const draft = () => cleanLabelPrinter({ ip, port, language, widthMm, heightMm, dpi: Number(dpi) });

  async function save() {
    const clean = draft();
    if (!clean) return setMsg({ ok: false, text: "Enter the printer's IP address, for example 192.168.1.60." });
    const res = await updateLabelPrinterAction(clean);
    setMsg(res.error ? { ok: false, text: res.error } : { ok: true, text: "Saved." });
    if (!res.error) router.refresh();
  }

  async function remove() {
    await updateLabelPrinterAction(null);
    setIp("");
    setMsg({ ok: true, text: "Label printer removed." });
    router.refresh();
  }

  async function test() {
    const clean = draft();
    if (!clean) return setMsg({ ok: false, text: "Enter the printer's IP address first." });
    try {
      await printViaLocalBridge({ printerIp: clean.ip, printerPort: clean.port, escposHex: buildLabelJob([testLabel()], clean).hex });
      setMsg({ ok: true, text: "Test label sent — check the printer." });
    } catch {
      setMsg({ ok: false, text: "Couldn't reach the print bridge on this device. Install or start it (see the Printers section), then try again." });
    }
  }

  const field = "w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100";
  return (
    <div>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-900">
        <Tags className="h-5 w-5 text-neutral-400" /> Label printer
      </h2>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        For a network label printer (Zebra and other ZPL printers, or TSC / Xprinter and other TSPL printers). Without one, labels print on A4 sheets.
        It is reached through the same print bridge as the receipt printer.
      </p>
      <div className="grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="col-span-2 text-xs font-medium text-neutral-500 sm:col-span-1">
          IP address
          <input aria-label="Label printer IP address" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.60" className={`mt-1 ${field}`} />
        </label>
        <label className="text-xs font-medium text-neutral-500">
          Port
          <input aria-label="Label printer port" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))} className={`mt-1 ${field}`} />
        </label>
        <label className="text-xs font-medium text-neutral-500">
          Language
          <select aria-label="Label printer language" value={language} onChange={(e) => setLanguage(e.target.value as "zpl" | "tspl")} className={`mt-1 ${field}`}>
            <option value="zpl">ZPL (Zebra)</option>
            <option value="tspl">TSPL (TSC, Xprinter…)</option>
          </select>
        </label>
        <label className="text-xs font-medium text-neutral-500">
          Label width (mm)
          <input aria-label="Label width" value={widthMm} onChange={(e) => setWidth(e.target.value.replace(/\D/g, ""))} className={`mt-1 ${field}`} />
        </label>
        <label className="text-xs font-medium text-neutral-500">
          Label height (mm)
          <input aria-label="Label height" value={heightMm} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ""))} className={`mt-1 ${field}`} />
        </label>
        <label className="text-xs font-medium text-neutral-500">
          Resolution
          <select aria-label="Label printer resolution" value={dpi} onChange={(e) => setDpi(e.target.value)} className={`mt-1 ${field}`}>
            <option value="203">203 dpi (8 dots/mm)</option>
            <option value="300">300 dpi (12 dots/mm)</option>
          </select>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={save} className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
          Save label printer
        </button>
        <button onClick={test} className="rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
          Print a test label
        </button>
        {config && (
          <button onClick={remove} className="rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50">
            Remove
          </button>
        )}
        {msg && <span className={`text-sm font-medium ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
