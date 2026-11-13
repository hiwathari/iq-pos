"use client";

import { useMemo, useState, useTransition } from "react";
import { applyDesignAction } from "@/lib/actions/site-builder";
import { FONTS } from "@/lib/site/fonts";
import { detailsFromData, type SiteDetails } from "@/lib/site/site-data";
import { previewDocument, TEMPLATES, type Design, type SiteData } from "@/lib/site/templates";

// The free, no-AI route: pick a ready-made design, set colours, fonts and the details shown on the page, see it live,
// then apply. The data comes from the customer's brief — or straight from IQ POS for a business that runs on it.

const input = "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-teal-300/60";
const label = "mb-1 block text-xs font-medium text-white/50";

export function DesignPanel({ token, data, initialDesign, hasSite, onApplied }: { token: string; data: SiteData; initialDesign: Design; hasSite: boolean; onApplied: () => void }) {
  const [design, setDesign] = useState<Design>(initialDesign);
  const [details, setDetails] = useState<SiteDetails>(() => detailsFromData(data));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, start] = useTransition();

  const liveData = useMemo<SiteData>(() => ({ ...data, ...details, hours: details.hours.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) }), [data, details]);
  const doc = useMemo(() => previewDocument(liveData, design), [liveData, design]);
  const thumbs = useMemo(() => TEMPLATES.map((t) => ({ t, doc: previewDocument(liveData, { ...design, template: t.id, headingFont: t.id === design.template ? design.headingFont : t.defaults.headingFont, bodyFont: t.id === design.template ? design.bodyFont : t.defaults.bodyFont, primary: t.id === design.template ? design.primary : t.defaults.primary, accent: t.id === design.template ? design.accent : t.defaults.accent, mode: t.defaults.mode }) })), [liveData, design]);

  // True once the business has a colour of its own (not one of the designs' stock colours).
  const brandColour = !TEMPLATES.some((t) => t.defaults.primary.toLowerCase() === design.primary.toLowerCase());

  const set = <K extends keyof Design>(k: K, v: Design[K]) => setDesign((d) => ({ ...d, [k]: v }));
  const setDetail = <K extends keyof SiteDetails>(k: K, v: SiteDetails[K]) => setDetails((d) => ({ ...d, [k]: v }));

  function pickTemplate(id: Design["template"]) {
    const t = TEMPLATES.find((x) => x.id === id)!;
    // Another look brings its own mode and fonts; a colour the customer chose (e.g. their brand colour) is kept.
    setDesign((d) => ({ ...t.defaults, primary: brandColour ? d.primary : t.defaults.primary, accent: brandColour ? d.accent : t.defaults.accent }));
  }

  function apply() {
    if (hasSite && !window.confirm("This rebuilds your page from the design. Any changes you made by hand in the editor will be replaced. Continue?")) return;
    setMessage(null);
    start(async () => {
      const r = await applyDesignAction(token, design, details).catch(() => ({ ok: false as const, error: "Couldn't reach the server — try again." }));
      if (r.ok) {
        setMessage({ ok: true, text: "Done — your website is ready." });
        onApplied();
      } else setMessage({ ok: false, text: r.error });
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-semibold">1. Choose a design</p>
          <div className="grid max-w-[22rem] grid-cols-1 gap-2">
            {thumbs.map(({ t, doc: d }) => (
              <button key={t.id} type="button" onClick={() => pickTemplate(t.id)} className={`overflow-hidden rounded-xl border text-left ${design.template === t.id ? "border-teal-300 ring-2 ring-teal-300/40" : "border-white/10 hover:border-white/30"}`}>
                <div className="pointer-events-none h-[9.2rem] overflow-hidden bg-white/5">
                  <iframe title={t.name} sandbox="" srcDoc={d} tabIndex={-1} className="h-[560px] w-[1280px] origin-top-left border-0" style={{ transform: "scale(0.27)" }} />
                </div>
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{t.name}</p>
                  <p className="text-xs text-white/50">{t.blurb}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">2. Colours &amp; fonts</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Main colour</label>
              <input type="color" value={design.primary} onChange={(e) => set("primary", e.target.value)} className="h-10 w-full cursor-pointer rounded-xl border border-white/10 bg-transparent" />
            </div>
            <div>
              <label className={label}>Second colour</label>
              <input type="color" value={design.accent} onChange={(e) => set("accent", e.target.value)} className="h-10 w-full cursor-pointer rounded-xl border border-white/10 bg-transparent" />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {(["dark", "light"] as const).map((m) => (
              <button key={m} type="button" onClick={() => set("mode", m)} className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold capitalize ${design.mode === m ? "border-teal-300 bg-teal-300/10" : "border-white/10 hover:border-white/30"}`}>
                {m} background
              </button>
            ))}
          </div>
          <label className={label + " mt-3"}>Heading font</label>
          <select value={design.headingFont} onChange={(e) => set("headingFont", e.target.value)} className={input}>
            {FONTS.filter((f) => f.kind === "heading").map((f) => (
              <option key={f.family} value={f.family} className="text-black">{f.family}</option>
            ))}
          </select>
          <label className={label + " mt-3"}>Body font</label>
          <select value={design.bodyFont} onChange={(e) => set("bodyFont", e.target.value)} className={input}>
            {FONTS.filter((f) => f.kind === "body").map((f) => (
              <option key={f.family} value={f.family} className="text-black">{f.family}</option>
            ))}
          </select>
        </div>

        <details className="rounded-xl border border-white/10 p-4" open={!data.about}>
          <summary className="cursor-pointer text-sm font-semibold">3. Your details (shown on the page)</summary>
          <div className="mt-3 space-y-3">
            {(
              [
                ["name", "Business name"],
                ["tagline", "Tagline (one line)"],
                ["cuisine", "Cuisine / type"],
                ["phone", "Phone"],
                ["email", "Email"],
                ["address", "Address"],
                ["instagram", "Instagram handle"],
              ] as const
            ).map(([k, l]) => (
              <div key={k}>
                <label className={label}>{l}</label>
                <input value={details[k]} onChange={(e) => setDetail(k, e.target.value)} className={input} />
              </div>
            ))}
            <div>
              <label className={label}>About you</label>
              <textarea value={details.about} onChange={(e) => setDetail("about", e.target.value)} rows={4} className={input} />
            </div>
            <div>
              <label className={label}>Opening hours (one line each)</label>
              <textarea value={details.hours} onChange={(e) => setDetail("hours", e.target.value)} rows={4} placeholder={"Mon–Fri 12:00–22:00\nSat–Sun 12:00–23:00"} className={input} />
            </div>
            <p className="text-xs text-white/40">{data.menu.length ? `Your menu (${data.menu.reduce((n, c) => n + c.items.length, 0)} items) is added automatically.` : "No menu found — you can add dishes in the editor afterwards."}</p>
          </div>
        </details>

        {message && <p className={`text-sm ${message.ok ? "text-teal-300" : "text-rose-300"}`}>{message.text}</p>}
        <button onClick={apply} disabled={busy} className="w-full rounded-full bg-teal-400 px-6 py-3.5 font-semibold text-[#04201F] hover:bg-teal-300 disabled:opacity-60">
          {busy ? "Building…" : hasSite ? "Rebuild my website with this design" : "Create my website — free"}
        </button>
        <p className="text-center text-xs text-white/40">Free. You can then edit everything by hand, and change the design any time.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white">
        <iframe title="Live preview" sandbox="" srcDoc={doc} className="h-[78vh] w-full border-0" />
      </div>
    </div>
  );
}
