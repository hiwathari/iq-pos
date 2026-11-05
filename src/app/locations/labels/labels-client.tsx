"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ArrowLeft, Printer } from "lucide-react";

// Bin labels (docs/retail-plan step 6.1): a QR code of the bin's code plus the code in big
// letters, 12 to an A4 page. Scan the QR with any scanner that reads 2D codes.
export function LabelsClient({ locations }: { locations: { id: string; code: string; name: string | null }[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set(locations.map((l) => l.id)));
  const [qr, setQr] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, string> = {};
      for (const l of locations) out[l.id] = await QRCode.toDataURL(l.code, { margin: 1, width: 180 });
      if (alive) setQr(out);
    })();
    return () => {
      alive = false;
    };
  }, [locations]);

  const shown = locations.filter((l) => picked.has(l.id));
  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="print:hidden">
        <Link href="/locations" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-800">
          <ArrowLeft className="h-4 w-4" /> Locations
        </Link>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Bin labels</h1>
            <p className="text-sm text-neutral-400">Tick the bins to print. Set the printer to 100% / actual size.</p>
          </div>
          <button onClick={() => window.print()} disabled={shown.length === 0} className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40">
            <Printer className="h-4 w-4" /> Print {shown.length} label{shown.length === 1 ? "" : "s"}
          </button>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          {locations.map((l) => (
            <label key={l.id} className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm">
              <input type="checkbox" checked={picked.has(l.id)} onChange={() => setPicked((cur) => { const n = new Set(cur); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); return n; })} className="accent-[var(--brand)]" />
              <span className="font-mono">{l.code}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 print:gap-0">
        {shown.map((l) => (
          <div key={l.id} className="flex break-inside-avoid flex-col items-center rounded-lg border border-dashed border-neutral-300 p-3 text-center print:rounded-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {qr[l.id] && <img src={qr[l.id]} alt={`QR ${l.code}`} className="h-28 w-28" />}
            <div className="mt-1 font-mono text-2xl font-bold text-black">{l.code}</div>
            {l.name && <div className="text-xs text-neutral-500">{l.name}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
