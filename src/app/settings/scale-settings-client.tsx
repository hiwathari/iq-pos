"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Scale, Trash2 } from "lucide-react";
import { updateEmbeddedBarcodesAction } from "@/lib/actions/restaurants";
import { parseEmbedded, type EmbeddedFormat } from "@/lib/barcode";
import { connectScale, forgetScale, loadScaleSettings, readScaleWeight, scaleSupported } from "@/lib/scale";

// Settings → Scales & scale labels (docs/retail-plan steps 3.2 and 3.10): the barcode layouts
// this business's labelling scales print, with a box to test a label, and this till's counter
// scale (Web Serial — remembered in this browser only).
export function ScaleSettingsClient({ formats }: { formats: EmbeddedFormat[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(formats.map((f) => ({ ...f, itemDigits: String(f.itemDigits), decimals: String(f.decimals) })));
  const [test, setTest] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [scale, setScale] = useState<{ supported: boolean; connected: boolean }>({ supported: false, connected: false });
  const [baud, setBaud] = useState("9600");
  const [request, setRequest] = useState("");
  const [scaleMsg, setScaleMsg] = useState<string | null>(null);

  useEffect(() => {
    setTimeout(() => {
      const saved = loadScaleSettings();
      setScale({ supported: scaleSupported(), connected: !!saved });
      if (saved) {
        setBaud(String(saved.baudRate));
        setRequest(saved.request ?? "");
      }
    }, 0);
  }, []);

  const parsed: EmbeddedFormat[] = rows.map((r) => ({ prefix: r.prefix.trim(), itemDigits: Number(r.itemDigits), value: r.value, decimals: Number(r.decimals) }));
  const read = test.trim() ? parseEmbedded(test.trim(), parsed) : null;

  async function save() {
    const result = await updateEmbeddedBarcodesAction(parsed);
    setMsg(result.error ?? "Saved.");
    if (!result.error) router.refresh();
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">Scales & scale labels</h2>
      <p className="mb-4 text-sm text-neutral-500">
        Labels printed by a weighing scale have the price or weight inside the barcode. Set the layout your scale uses (its manual calls it
        the barcode or EAN format), then put each product&rsquo;s scale number in its PLU field.
      </p>
      <div className="max-w-2xl space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 p-2.5 text-sm">
            <label className="flex items-center gap-1.5">
              Starts with
              <input value={r.prefix} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, prefix: e.target.value.replace(/\D/g, "").slice(0, 3) } : x)))} className="w-14 rounded-lg border border-neutral-200 px-2 py-1.5" aria-label="Prefix" />
            </label>
            <label className="flex items-center gap-1.5">
              PLU digits
              <input value={r.itemDigits} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, itemDigits: e.target.value.replace(/\D/g, "") } : x)))} className="w-12 rounded-lg border border-neutral-200 px-2 py-1.5" aria-label="PLU digits" />
            </label>
            <select value={r.value} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value as "price" | "weight", decimals: e.target.value === "price" ? "2" : "3" } : x)))} className="rounded-lg border border-neutral-200 px-2 py-1.5" aria-label="Holds">
              <option value="price">holds the price</option>
              <option value="weight">holds the weight</option>
            </select>
            <label className="flex items-center gap-1.5">
              decimals
              <input value={r.decimals} onChange={(e) => setRows((p) => p.map((x, j) => (j === i ? { ...x, decimals: e.target.value.replace(/\D/g, "").slice(0, 1) } : x)))} className="w-10 rounded-lg border border-neutral-200 px-2 py-1.5" aria-label="Decimals" />
            </label>
            <button type="button" onClick={() => setRows((p) => p.filter((_, j) => j !== i))} className="ml-auto rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove format">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setRows((p) => [...p, { prefix: "2", itemDigits: "5", value: "weight", decimals: "3" }])} className="flex items-center gap-1 rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50">
            <Plus className="h-4 w-4" /> Add format
          </button>
          <button type="button" onClick={save} className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
            Save formats
          </button>
          {msg && <span className="text-sm text-neutral-500">{msg}</span>}
        </div>
        <div className="pt-2">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Test a label — scan or type its barcode</label>
          <input value={test} onChange={(e) => setTest(e.target.value)} placeholder="e.g. 2201234017507" className="w-72 rounded-xl border border-neutral-200 px-3.5 py-2.5 font-mono text-sm" />
          {test.trim() && (
            <p className="mt-1 text-sm text-neutral-600">
              {read ? `PLU ${read.plu} · ${read.price != null ? `price £${read.price.toFixed(2)}` : `weight ${read.weight} kg`}` : "Not a scale label with these formats (or the check digit is wrong)."}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 max-w-2xl rounded-xl border border-neutral-200 p-4">
        <h3 className="flex items-center gap-2 font-semibold text-neutral-800">
          <Scale className="h-4 w-4" /> This till&rsquo;s counter scale
        </h3>
        {!scale.supported ? (
          <p className="mt-1 text-sm text-neutral-500">Connecting a scale needs Chrome or Edge on a computer with the scale plugged in. On other tills, type the weight on the pad.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-neutral-500">
              {scale.connected ? "Set up on this till — the weight pad shows Read scale." : "Plug the scale in, choose its speed (from its manual), then Connect and pick it in the list."}
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2 text-sm">
              <label className="text-xs font-medium text-neutral-500">
                Speed (baud)
                <select value={baud} onChange={(e) => setBaud(e.target.value)} className="mt-1 block rounded-lg border border-neutral-200 px-2 py-2 text-sm text-neutral-800">
                  {["2400", "4800", "9600", "19200", "38400"].map((b) => (
                    <option key={b}>{b}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-neutral-500">
                Ask command (optional)
                <input value={request} onChange={(e) => setRequest(e.target.value)} placeholder='e.g. W\r' className="mt-1 block w-32 rounded-lg border border-neutral-200 px-2 py-2 text-sm text-neutral-800" />
              </label>
              <button
                type="button"
                onClick={async () => {
                  const r = await connectScale({ baudRate: Number(baud), request: request || undefined });
                  setScaleMsg("error" in r ? r.error : "Connected.");
                  if (!("error" in r)) setScale((s) => ({ ...s, connected: true }));
                }}
                className="rounded-lg bg-[var(--brand)] px-3 py-2 font-semibold text-white hover:bg-[var(--brand-dark)]"
              >
                {scale.connected ? "Reconnect" : "Connect scale"}
              </button>
              {scale.connected && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await readScaleWeight();
                      setScaleMsg("error" in r ? r.error : `Reads ${r.kg} kg${r.stable ? "" : " (not stable)"}`);
                    }}
                    className="rounded-lg border border-neutral-200 px-3 py-2 text-neutral-700 hover:bg-neutral-50"
                  >
                    Test reading
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      forgetScale();
                      setScale((s) => ({ ...s, connected: false }));
                      setScaleMsg("Removed from this till.");
                    }}
                    className="rounded-lg px-3 py-2 text-neutral-500 hover:text-rose-600"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
            {scaleMsg && <p className="mt-2 text-sm text-neutral-600">{scaleMsg}</p>}
          </>
        )}
        <p className="mt-2 text-xs text-neutral-400">Only a trade-approved scale may be used to price goods sold by weight.</p>
      </div>
    </div>
  );
}
