"use client";

import { useMemo, useState, useTransition } from "react";
import { Bot, Check, ExternalLink, FileText, Globe, KeyRound, Mail, Phone, Sparkles, Upload, X } from "lucide-react";
import {
  clearAiKeyAction,
  saveAiKeyAction,
  testSavedAiKeyAction,
  updateWebsiteRequestAction,
  type WebsiteBriefAnswers,
} from "@/lib/actions/website-requests";
import type { BriefFields } from "@/lib/site/brief";
import { getProduct } from "@/lib/site/products";
import type { WebsiteRequestRow } from "@/lib/data/website-requests";

type Status = WebsiteRequestRow["status"];

const STATUS_LABEL: Record<Status, string> = { new: "New", in_progress: "In progress", done: "Done", archived: "Archived" };
const STATUS_TONE: Record<Status, string> = {
  new: "bg-rose-50 text-rose-700 ring-rose-200",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
  done: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  archived: "bg-neutral-100 text-neutral-500 ring-neutral-200",
};

function formatDate(ms: number) {
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function WebsiteRequestsClient({
  requests,
  aiKey,
  blobEnabled,
}: {
  requests: WebsiteRequestRow[] | null;
  aiKey: { configured: boolean; last4: string | null; updatedAt: number | null } | null;
  blobEnabled: boolean;
}) {
  const [filter, setFilter] = useState<Status | "all">("new");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: requests?.length ?? 0 };
    for (const r of requests ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);
  const shown = (requests ?? []).filter((r) => filter === "all" || r.status === filter);
  const open = requests?.find((r) => r.id === openId) ?? null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Website Requests</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Briefs sent from the IQ website&apos;s{" "}
          <a href="https://iq.luvder.com/build" target="_blank" rel="noreferrer" className="font-medium text-teal-700 hover:underline">
            Build my website
          </a>{" "}
          page.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AiKeyCard status={aiKey} />
        <div className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${blobEnabled ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
            <Upload className="h-5 w-5" />
          </span>
          <div>
            <div className="font-semibold text-neutral-900">File uploads {blobEnabled ? "on" : "off"}</div>
            <p className="mt-1 text-sm text-neutral-500">
              {blobEnabled
                ? "Logos, menus and photos are stored in Vercel Blob and linked below."
                : "Vercel Blob isn't connected, so only file names are kept (menus are still read for dishes). Create a public Blob store in Vercel → Storage and connect it to this project to keep the files."}
            </p>
          </div>
        </div>
      </div>

      {requests === null ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          The <code className="font-mono">website_requests</code> table doesn&apos;t exist yet. Run the SQL from the Developer Guide changelog (Website builder entry) on the database, then reload.
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {(["new", "in_progress", "done", "archived", "all"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-full px-4 py-2 text-sm font-medium ${filter === s ? "bg-neutral-900 text-white" : "border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"}`}
              >
                {s === "all" ? "All" : STATUS_LABEL[s]} <span className="ml-1 opacity-60">{counts[s] ?? 0}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">No requests here yet.</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
              {shown.map((r) => {
                const fields = (r.details as { fields?: BriefFields }).fields;
                return (
                  <button key={r.id} onClick={() => setOpenId(r.id)} className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 border-b border-neutral-100 px-5 py-4 text-left last:border-0 hover:bg-neutral-50">
                    <div className="min-w-[180px] flex-1">
                      <div className="font-semibold text-neutral-900">{r.restaurantName}</div>
                      <div className="text-xs text-neutral-400">
                        {fields?.cuisine || "—"} · {fields?.address || "no address"}
                      </div>
                    </div>
                    <div className="min-w-[160px] text-sm text-neutral-600">
                      {r.contactName}
                      <div className="text-xs text-neutral-400">{r.contactEmail}</div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(fields?.features ?? []).slice(0, 4).map((f) => (
                        <span key={f} className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
                          {getProduct(f)?.name ?? f}
                        </span>
                      ))}
                    </div>
                    <div className="text-xs text-neutral-400">{formatDate(r.createdAt)}</div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {open && <RequestDrawer request={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function AiKeyCard({ status }: { status: { configured: boolean; last4: string | null; updatedAt: number | null } | null }) {
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const configured = !!status?.configured;

  return (
    <div className="flex gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${configured ? "bg-emerald-50 text-emerald-600" : "bg-neutral-100 text-neutral-500"}`}>
        <Bot className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 font-semibold text-neutral-900">
          AI reading {configured ? "on" : "off"}
          {configured && <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-xs font-normal text-neutral-500">sk-ant-…{status?.last4}</span>}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {status === null
            ? "The platform_settings table doesn't exist yet — run the SQL first."
            : configured
              ? "Claude reads each brief, the menu files and the logo to fill in the form. If a call fails, the basic pattern matching takes over."
              : "Briefs are pre-filled with basic pattern matching. Add an Anthropic API key to have Claude read the description, menu PDFs and logo instead."}
        </p>

        {editing ? (
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              startTransition(async () => {
                const res = await saveAiKeyAction(key);
                if (res.ok) {
                  setKey("");
                  setEditing(false);
                  setMessage({ ok: true, text: "Key saved and working." });
                } else setMessage({ ok: false, text: res.error });
              });
            }}
          >
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-…"
              className="min-w-[220px] flex-1 rounded-xl border border-neutral-200 px-3 py-2 font-mono text-sm outline-none focus:border-teal-500"
            />
            <button disabled={pending || !key} className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              {pending ? "Checking…" : "Save key"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl px-3 py-2 text-sm text-neutral-500 hover:bg-neutral-100">
              Cancel
            </button>
          </form>
        ) : (
          status !== null && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-xl border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                <KeyRound className="h-4 w-4" /> {configured ? "Replace key" : "Add API key"}
              </button>
              {configured && (
                <>
                  <button
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await testSavedAiKeyAction();
                        setMessage(res.ok ? { ok: true, text: "The saved key works." } : { ok: false, text: res.error });
                      })
                    }
                    className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                  >
                    Test
                  </button>
                  <button
                    disabled={pending}
                    onClick={() => {
                      if (!confirm("Remove the API key? Briefs will go back to basic pattern matching.")) return;
                      startTransition(async () => {
                        await clearAiKeyAction();
                        setMessage({ ok: true, text: "Key removed." });
                      });
                    }}
                    className="rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          )
        )}
        {message && <p className={`mt-2 text-sm ${message.ok ? "text-emerald-600" : "text-rose-600"}`}>{message.text}</p>}
        <p className="mt-2 text-xs text-neutral-400">Stored encrypted. Only the last four characters are ever shown. Uses Claude Opus 5.5.</p>
      </div>
    </div>
  );
}

function RequestDrawer({ request, onClose }: { request: WebsiteRequestRow; onClose: () => void }) {
  const details = request.details as { fields?: BriefFields; answers?: WebsiteBriefAnswers };
  const f = details.fields;
  const a = details.answers;
  const [notes, setNotes] = useState(request.adminNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update(patch: Parameters<typeof updateWebsiteRequestAction>[1]) {
    setSaved(false);
    startTransition(async () => {
      await updateWebsiteRequestAction(request.id, patch);
      setSaved(true);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-100 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{request.restaurantName}</h2>
            <p className="text-xs text-neutral-400">
              Ref {request.id.slice(0, 8).toUpperCase()} · {formatDate(request.createdAt)} ·{" "}
              {request.extractedWith === "ai" ? (
                <span className="inline-flex items-center gap-1 text-teal-700">
                  <Sparkles className="h-3 w-3" /> pre-filled by AI
                </span>
              ) : (
                "pre-filled by pattern matching"
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
              <button
                key={s}
                disabled={pending}
                onClick={() => update({ status: s })}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ${request.status === s ? STATUS_TONE[s] : "text-neutral-500 ring-neutral-200 hover:bg-neutral-50"}`}
              >
                {request.status === s && <Check className="mr-1 inline h-3.5 w-3.5" />}
                {STATUS_LABEL[s]}
              </button>
            ))}
            {saved && <span className="text-xs text-emerald-600">Saved</span>}
          </div>

          <Block title="Contact">
            <div className="text-sm text-neutral-800">{request.contactName}</div>
            <div className="mt-1 flex flex-wrap gap-4 text-sm">
              <a href={`mailto:${request.contactEmail}?subject=${encodeURIComponent(`Your ${request.restaurantName} website`)}`} className="flex items-center gap-1.5 text-teal-700 hover:underline">
                <Mail className="h-4 w-4" /> {request.contactEmail}
              </a>
              {request.contactPhone && (
                <a href={`tel:${request.contactPhone}`} className="flex items-center gap-1.5 text-teal-700 hover:underline">
                  <Phone className="h-4 w-4" /> {request.contactPhone}
                </a>
              )}
            </div>
          </Block>

          <Block title="What they wrote">
            <p className="whitespace-pre-wrap rounded-xl bg-neutral-50 p-4 text-sm leading-relaxed text-neutral-700">{request.description}</p>
          </Block>

          {f && (
            <Block title="Restaurant">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Item label="Cuisine" value={f.cuisine} />
                <Item label="Address" value={f.address} />
                <Item label="Phone" value={f.phone} />
                <Item label="Email" value={f.email} />
                <Item label="Website" value={f.website} />
                <Item label="Instagram" value={f.instagram} />
                <Item label="Opening hours" value={f.openingHours} wide />
                <Item label="About" value={f.about} wide />
              </dl>
              {f.colours.length > 0 && (
                <div className="mt-4 flex items-center gap-2">
                  {f.colours.map((c) => (
                    <span key={c} className="flex items-center gap-1.5 rounded-full border border-neutral-200 py-1 pl-1 pr-2.5 font-mono text-xs text-neutral-600">
                      <span className="h-5 w-5 rounded-full ring-1 ring-black/10" style={{ background: c }} />
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </Block>
          )}

          <Block title={`Files (${request.files.length})`}>
            {request.files.length === 0 ? (
              <p className="text-sm text-neutral-400">None attached.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {request.files.map((file, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-neutral-200 p-2.5">
                    {file.url && /\.(png|jpe?g|webp)$/i.test(file.url) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote Blob thumbnail
                      <img src={file.url} alt="" className="h-10 w-10 rounded-lg bg-neutral-50 object-contain" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                        <FileText className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-neutral-800">{file.name}</div>
                      <div className="text-xs capitalize text-neutral-400">{file.kind}</div>
                    </div>
                    {file.url ? (
                      <a href={file.url} target="_blank" rel="noreferrer" className="rounded-lg p-1.5 text-teal-700 hover:bg-teal-50" aria-label={`Open ${file.name}`}>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-neutral-400">not stored</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Block>

          {f && f.menuItems.length > 0 && (
            <Block title={`Menu (${f.menuItems.length})`}>
              <div className="max-h-72 overflow-y-auto rounded-xl border border-neutral-200">
                <table className="w-full text-sm">
                  <tbody>
                    {f.menuItems.map((m, i) => (
                      <tr key={i} className="border-b border-neutral-100 last:border-0">
                        <td className="px-3 py-2 text-neutral-800">{m.name}</td>
                        <td className="px-3 py-2 text-xs text-neutral-400">{m.category}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{m.price}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Block>
          )}

          {(f || a) && (
            <Block title="What they want">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                <Item label="Products" value={(f?.features ?? []).map((s) => getProduct(s)?.name ?? s).join(", ")} wide />
                <Item label="Style" value={a?.style ?? ""} />
                <Item label="Pages" value={(a?.pages ?? []).join(", ")} />
                <Item
                  label="Domain"
                  value={a ? (a.domainChoice === "have" ? `Has one: ${a.domain || "—"}` : a.domainChoice === "need" ? `Needs one${a.domain ? `: ${a.domain}` : ""}` : "Decide later") : ""}
                />
                <Item label="Timeline" value={a?.timeline ?? ""} />
                <Item label="Uses IQ POS" value={a ? { yes: "Yes", no: "No", interested: "Interested" }[a.usesIqPos] : ""} />
                <Item label="Notes" value={a?.notes ?? ""} wide />
              </dl>
            </Block>
          )}

          <Block title="Internal notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Only visible to Super Admin"
              className="w-full rounded-xl border border-neutral-200 p-3 text-sm outline-none focus:border-teal-500"
            />
            <button disabled={pending} onClick={() => update({ adminNotes: notes })} className="mt-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
              Save notes
            </button>
          </Block>

          {f?.website && (
            <a href={f.website.startsWith("http") ? f.website : `https://${f.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-teal-700 hover:underline">
              <Globe className="h-4 w-4" /> Open their current website
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">{title}</h3>
      {children}
    </section>
  );
}

function Item({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-xs text-neutral-400">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-neutral-800">{value || "—"}</dd>
    </div>
  );
}
