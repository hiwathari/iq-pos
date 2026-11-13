"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatPence } from "@/lib/site/builder-pricing";
import {
  clearGeminiKeyAction,
  clearStripeAction,
  createCouponAction,
  deleteCouponAction,
  saveBuilderPromptAction,
  saveGeminiKeyAction,
  saveStripeAction,
  setCouponActiveAction,
  testSavedGeminiKeyAction,
} from "@/lib/actions/site-builder-admin";
import type { getBuilderOverview } from "@/lib/site/admin";

type Overview = Awaited<ReturnType<typeof getBuilderOverview>>;

const card = "rounded-2xl border border-neutral-200 bg-white p-5";
const input = "w-full rounded-xl border border-neutral-200 px-3 py-2.5 text-sm outline-none focus:border-teal-500";
const btn = "rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50";
const btnGhost = "rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

function Status({ ok, text }: { ok: boolean; text: string }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ok ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"}`}>{text}</span>;
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export function SiteBuilderClient({ overview }: { overview: Overview }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [geminiKey, setGeminiKey] = useState("");
  const [model, setModel] = useState(overview.model);
  const [stripeKey, setStripeKey] = useState("");
  const [stripeHook, setStripeHook] = useState("");
  const [engine, setEngine] = useState(overview.engine);
  const [prompt, setPrompt] = useState(overview.prompt);
  const [couponForm, setCouponForm] = useState({ code: "", kind: "percent" as "percent" | "pence", value: "100", appliesTo: "any" as "any" | "build" | "change", expires: "", maxUses: "", note: "" });

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r && "ok" in r && !r.ok ? { ok: false, text: r.error ?? "Failed." } : { ok: true, text: okText });
    });

  const webhookUrl = "https://pos.luvder.com/api/webhooks/stripe-site";
  const data = overview.data;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Website builder</h1>
        <p className="mt-1 text-sm text-neutral-500">Customers pay on iq.luvder.com, an AI writes their site, and they edit it in the visual editor. Keys are stored encrypted and never shown again.</p>
      </div>

      {msg && <p className={`rounded-xl px-4 py-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}

      {!data && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">The website-builder tables don&apos;t exist yet — run the website builder SQL on Turso.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={card}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-neutral-900">Gemini (Google AI Studio)</h2>
            <Status ok={overview.gemini.configured} text={overview.gemini.configured ? `Key …${overview.gemini.last4}` : "No key"} />
          </div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">API key {overview.gemini.configured && "(leave empty to keep the saved one)"}</label>
          <input type="password" autoComplete="off" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder="AIza…" className={input} />
          <label className="mb-1 mt-3 block text-xs font-medium text-neutral-500">Model name</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} className={input} />
          <p className="mt-1 text-xs text-neutral-400">&ldquo;gemini-flash-latest&rdquo; always points at the current Flash model. Change it here if Google renames it.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={pending} className={btn} onClick={() => run(async () => { const r = await saveGeminiKeyAction(geminiKey, model); if (r.ok) setGeminiKey(""); return r; }, "Saved.")}>
              Save
            </button>
            {overview.gemini.configured && (
              <>
                <button disabled={pending} className={btnGhost} onClick={() => run(testSavedGeminiKeyAction, "The saved key works.")}>
                  Test key
                </button>
                <button disabled={pending} className={btnGhost} onClick={() => run(async () => { await clearGeminiKeyAction(); }, "Key removed.")}>
                  Remove
                </button>
              </>
            )}
          </div>
        </section>

        <section className={card}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-neutral-900">Stripe payments</h2>
            <Status ok={overview.stripeKey.configured} text={overview.stripeKey.configured ? `Key …${overview.stripeKey.last4}` : "Not set up"} />
          </div>
          <label className="mb-1 block text-xs font-medium text-neutral-500">Secret key {overview.stripeKey.configured && "(leave empty to keep)"}</label>
          <input type="password" autoComplete="off" value={stripeKey} onChange={(e) => setStripeKey(e.target.value)} placeholder="sk_live_… or sk_test_…" className={input} />
          <label className="mb-1 mt-3 block text-xs font-medium text-neutral-500">Webhook signing secret {overview.stripeHook.configured && `(saved …${overview.stripeHook.last4})`}</label>
          <input type="password" autoComplete="off" value={stripeHook} onChange={(e) => setStripeHook(e.target.value)} placeholder="whsec_…" className={input} />
          <p className="mt-1 text-xs text-neutral-400">
            In Stripe → Developers → Webhooks add the endpoint <code className="rounded bg-neutral-100 px-1">{webhookUrl}</code> for the event <code className="rounded bg-neutral-100 px-1">checkout.session.completed</code>. Prices: first build £4.99, each AI change £1.00.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={pending} className={btn} onClick={() => run(async () => { const r = await saveStripeAction(stripeKey, stripeHook); if (r.ok) { setStripeKey(""); setStripeHook(""); } return r; }, "Saved.")}>
              Save
            </button>
            {overview.stripeKey.configured && (
              <button disabled={pending} className={btnGhost} onClick={() => run(async () => { await clearStripeAction("key"); }, "Stripe key removed.")}>
                Remove key
              </button>
            )}
            {overview.stripeHook.configured && (
              <button disabled={pending} className={btnGhost} onClick={() => run(async () => { await clearStripeAction("webhook"); }, "Webhook secret removed.")}>
                Remove webhook secret
              </button>
            )}
          </div>
        </section>
      </div>

      <section className={card}>
        <h2 className="font-semibold text-neutral-900">Which AI writes the sites, and house rules</h2>
        <label className="mb-1 mt-3 block text-xs font-medium text-neutral-500">Engine</label>
        <select value={engine} onChange={(e) => setEngine(e.target.value as typeof engine)} className={input + " max-w-md"}>
          <option value="auto">Automatic — Claude when an Anthropic key is saved, otherwise Gemini</option>
          <option value="gemini">Always Gemini</option>
          <option value="claude">Claude when available (falls back to Gemini)</option>
        </select>
        <p className="mt-1 text-xs text-neutral-400">Anthropic key: {overview.claudeConfigured ? "saved (Website Requests page)" : "not saved — Gemini will be used"}.</p>
        <label className="mb-1 mt-4 block text-xs font-medium text-neutral-500">Extra instructions added to every build and change</label>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6} maxLength={6000} placeholder="e.g. Always include a footer line “Website by IQ”. Prefer a dark hero section…" className={input} />
        <button disabled={pending} className={btn + " mt-3"} onClick={() => run(() => saveBuilderPromptAction(engine, prompt), "Saved.")}>
          Save
        </button>
      </section>

      {data && (
        <>
          <section className={card}>
            <h2 className="font-semibold text-neutral-900">Coupon codes</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-medium text-neutral-500">Code</label>
                <div className="flex gap-2">
                  <input value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })} placeholder="LAUNCH50" className={input} />
                  <button type="button" className={btnGhost} onClick={() => setCouponForm({ ...couponForm, code: randomCode() })}>
                    Random
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Takes off</label>
                <div className="flex gap-2">
                  <input value={couponForm.value} onChange={(e) => setCouponForm({ ...couponForm, value: e.target.value })} inputMode="decimal" className={input} />
                  <select value={couponForm.kind} onChange={(e) => setCouponForm({ ...couponForm, kind: e.target.value as "percent" | "pence" })} className={input + " w-24"}>
                    <option value="percent">%</option>
                    <option value="pence">£</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Works for</label>
                <select value={couponForm.appliesTo} onChange={(e) => setCouponForm({ ...couponForm, appliesTo: e.target.value as "any" | "build" | "change" })} className={input}>
                  <option value="any">First build and changes</option>
                  <option value="build">First build only</option>
                  <option value="change">Changes only</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Expires (optional)</label>
                <input type="datetime-local" value={couponForm.expires} onChange={(e) => setCouponForm({ ...couponForm, expires: e.target.value })} className={input} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-500">Use limit (optional)</label>
                <input value={couponForm.maxUses} onChange={(e) => setCouponForm({ ...couponForm, maxUses: e.target.value })} inputMode="numeric" placeholder="Unlimited" className={input} />
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-xs font-medium text-neutral-500">Note (only you see this)</label>
                <input value={couponForm.note} onChange={(e) => setCouponForm({ ...couponForm, note: e.target.value })} placeholder="Who is it for?" className={input} />
              </div>
            </div>
            <button
              disabled={pending || !couponForm.code.trim()}
              className={btn + " mt-4"}
              onClick={() =>
                run(async () => {
                  const r = await createCouponAction({
                    code: couponForm.code,
                    kind: couponForm.kind,
                    value: Number(couponForm.value),
                    appliesTo: couponForm.appliesTo,
                    expiresAt: couponForm.expires ? new Date(couponForm.expires).getTime() : null,
                    maxUses: couponForm.maxUses.trim() ? Number(couponForm.maxUses) : null,
                    note: couponForm.note,
                  });
                  if (r.ok) setCouponForm({ ...couponForm, code: "", note: "" });
                  return r;
                }, "Coupon created.")
              }
            >
              Create coupon
            </button>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-neutral-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 font-medium">Discount</th>
                    <th className="py-2 pr-3 font-medium">For</th>
                    <th className="py-2 pr-3 font-medium">Used</th>
                    <th className="py-2 pr-3 font-medium">Expires</th>
                    <th className="py-2 pr-3 font-medium">Note</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.coupons.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-neutral-400">
                        No coupons yet.
                      </td>
                    </tr>
                  )}
                  {data.coupons.map((c) => {
                    const expired = c.expiresAt !== null && c.expiresAt <= overview.now;
                    const usedUp = c.maxUses !== null && c.uses >= c.maxUses;
                    return (
                      <tr key={c.id} className="border-t border-neutral-100">
                        <td className="py-2 pr-3 font-mono font-semibold">{c.code}</td>
                        <td className="py-2 pr-3">{c.percentOff ? `${c.percentOff}%` : formatPence(c.penceOff ?? 0)}</td>
                        <td className="py-2 pr-3">{c.appliesTo === "any" ? "All" : c.appliesTo === "build" ? "First build" : "Changes"}</td>
                        <td className="py-2 pr-3">
                          {c.uses}
                          {c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                        </td>
                        <td className="py-2 pr-3">{c.expiresAt ? new Date(c.expiresAt).toLocaleString() : "Never"}</td>
                        <td className="py-2 pr-3 text-neutral-500">{c.note}</td>
                        <td className="py-2 text-right">
                          <span className="mr-2">
                            <Status ok={c.active && !expired && !usedUp} text={!c.active ? "Off" : expired ? "Expired" : usedUp ? "Used up" : "Live"} />
                          </span>
                          <button disabled={pending} className="mr-2 text-xs font-semibold text-teal-700 hover:underline" onClick={() => run(async () => { await setCouponActiveAction(c.id, !c.active); }, c.active ? "Coupon switched off." : "Coupon switched on.")}>
                            {c.active ? "Switch off" : "Switch on"}
                          </button>
                          <button
                            disabled={pending}
                            className="text-xs font-semibold text-rose-600 hover:underline"
                            onClick={() => {
                              if (window.confirm(`Delete ${c.code}?`)) run(async () => { await deleteCouponAction(c.id); }, "Coupon deleted.");
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className={card}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-neutral-900">Customer sites</h2>
              <span className="text-sm text-neutral-500">Taken so far: {formatPence(data.revenuePence)}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-neutral-400">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Business</th>
                    <th className="py-2 pr-3 font-medium">Email</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Engine</th>
                    <th className="py-2 pr-3 font-medium">Paid</th>
                    <th className="py-2 pr-3 font-medium">Started</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {data.projects.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-neutral-400">
                        Nobody has started a site yet.
                      </td>
                    </tr>
                  )}
                  {data.projects.map((p) => (
                    <tr key={p.id} className="border-t border-neutral-100">
                      <td className="py-2 pr-3 font-medium">{p.name}</td>
                      <td className="py-2 pr-3 text-neutral-500">{p.contactEmail}</td>
                      <td className="py-2 pr-3">
                        <Status ok={p.status === "ready"} text={p.status.replace("_", " ")} />
                        {p.lastError && <span title={p.lastError} className="ml-2 text-xs text-rose-600">error</span>}
                      </td>
                      <td className="py-2 pr-3">{p.engine ?? "—"}</td>
                      <td className="py-2 pr-3">{formatPence(p.paidPence)}</td>
                      <td className="py-2 pr-3 text-neutral-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 text-right">
                        {p.html && (
                          <Link href={`/site/preview/${p.token}`} target="_blank" className="text-xs font-semibold text-teal-700 hover:underline">
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
