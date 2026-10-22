"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ArrowLeft, ArrowRight, Check, FileText, ImageIcon, LoaderCircle, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { submitWebsiteRequestAction, type WebsiteBriefAnswers } from "@/lib/actions/website-requests";
import {
  BRIEF_PAGES,
  BRIEF_STYLES,
  EMPTY_BRIEF,
  MAX_DESCRIPTION,
  MAX_INLINE_BYTES,
  MAX_UPLOAD_BYTES,
  UPLOAD_TYPES,
  type AnalyseResult,
  type BriefFields,
  type BriefFile,
} from "@/lib/site/brief";
import { PRODUCTS } from "@/lib/site/products";
import { BUILD_DRAFT_KEY } from "../_components/hero-prompt";
import { ProductIcon, StatusBadge } from "../_components/product-icon";

type Kind = BriefFile["kind"];
type Step = "describe" | "reading" | "review" | "details" | "done";

interface Attached {
  id: number;
  kind: Kind;
  file: File;
  preview: string | null;
  url: string | null;
  status: "uploading" | "ready" | "error";
  progress: number;
  error?: string;
}

const KIND_INFO: Record<Kind, { label: string; hint: string; max: number; accept: string }> = {
  logo: { label: "Logo", hint: "PNG, JPG or WebP", max: 1, accept: "image/png,image/jpeg,image/webp" },
  menu: { label: "Menu", hint: "PDF or photos of it", max: 5, accept: "application/pdf,image/png,image/jpeg,image/webp" },
  photo: { label: "Photos", hint: "Food, the room, the team", max: 6, accept: "image/png,image/jpeg,image/webp" },
};

const READING_STEPS = ["Reading your description", "Looking for contact details and hours", "Reading your menu", "Picking colours from your logo", "Filling in your brief"];

const DEFAULT_ANSWERS: WebsiteBriefAnswers = {
  style: "",
  pages: ["Home", "Menu", "Contact & map"],
  domainChoice: "have",
  domain: "",
  timeline: "",
  usesIqPos: "interested",
  notes: "",
};

let nextId = 1;

// Dominant colours of a logo, worked out in the browser: sample the image small, bucket the
// pixels, and keep the most common buckets that are clearly different from each other — skipping
// near-white/transparent background.
async function logoColours(src: string): Promise<string[]> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const buckets = new Map<string, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200 || (r > 238 && g > 238 && b > 238)) continue;
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const cur = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    cur.r += r;
    cur.g += g;
    cur.b += b;
    cur.n += 1;
    buckets.set(key, cur);
  }
  const picked: { r: number; g: number; b: number }[] = [];
  const total = [...buckets.values()].reduce((sum, c) => sum + c.n, 0);
  for (const c of [...buckets.values()].sort((x, y) => y.n - x.n)) {
    // Under ~4% of the logo is usually anti-aliasing between two real colours, not a colour.
    if (c.n < Math.max(12, total * 0.04)) break;
    const col = { r: c.r / c.n, g: c.g / c.n, b: c.b / c.n };
    if (picked.every((p) => Math.hypot(p.r - col.r, p.g - col.g, p.b - col.b) > 70)) picked.push(col);
    if (picked.length === 3) break;
  }
  return picked.map((c) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`.toUpperCase());
}

function formatSize(bytes: number) {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function BuildClient({ base, blobEnabled, initialFeatures }: { base: string; blobEnabled: boolean; initialFeatures: string[] }) {
  const [step, setStep] = useState<Step>("describe");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<Attached[]>([]);
  const [detected, setDetected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<BriefFields>(EMPTY_BRIEF);
  const [found, setFound] = useState<(keyof BriefFields)[]>([]);
  const [extractedWith, setExtractedWith] = useState<"basic" | "ai">("basic");
  const [answers, setAnswers] = useState<WebsiteBriefAnswers>(DEFAULT_ANSWERS);
  const [contact, setContact] = useState({ name: "", email: "", phone: "" });
  const [readingIndex, setReadingIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [ref, setRef] = useState("");
  const [showAllMenu, setShowAllMenu] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  // Pick up what was typed into the home page's prompt box. Read after mount (sessionStorage
  // doesn't exist during server rendering), on the next frame so it isn't a synchronous
  // setState inside the effect.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const draft = sessionStorage.getItem(BUILD_DRAFT_KEY);
        if (draft) {
          sessionStorage.removeItem(BUILD_DRAFT_KEY);
          setDescription((current) => current || draft.slice(0, MAX_DESCRIPTION));
        }
      } catch {
        // Storage blocked — start empty.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  useEffect(() => {
    if (step !== "reading") return;
    const id = window.setInterval(() => setReadingIndex((i) => Math.min(i + 1, READING_STEPS.length - 1)), 900);
    return () => window.clearInterval(id);
  }, [step]);

  const busy = files.some((f) => f.status === "uploading");
  const inlineTotal = files.reduce((sum, f) => sum + f.file.size, 0);

  function patchFile(id: number, patch: Partial<Attached>) {
    setFiles((list) => list.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function addFiles(kind: Kind, list: FileList | null) {
    if (!list) return;
    setError(null);
    const room = KIND_INFO[kind].max - files.filter((f) => f.kind === kind).length;
    const incoming = [...list].slice(0, Math.max(0, kind === "logo" ? 1 : room));
    if (kind === "logo") setFiles((cur) => cur.filter((f) => f.kind !== "logo"));
    for (const file of incoming) {
      if (!UPLOAD_TYPES.includes(file.type)) {
        setError(`${file.name} isn't a PDF, PNG, JPG or WebP file.`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(`${file.name} is over ${formatSize(MAX_UPLOAD_BYTES)}.`);
        continue;
      }
      if (!blobEnabled && inlineTotal + file.size > MAX_INLINE_BYTES) {
        setError(`Files can add up to ${formatSize(MAX_INLINE_BYTES)} for now — try a smaller menu PDF or fewer photos.`);
        continue;
      }
      const id = nextId++;
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      setFiles((cur) => [...cur, { id, kind, file, preview, url: null, status: blobEnabled ? "uploading" : "ready", progress: 0 }]);

      if (kind === "logo" && preview) {
        logoColours(preview)
          .then((c) => setDetected(c))
          .catch(() => setDetected([]));
      }
      if (blobEnabled) {
        const safeName = file.name.replace(/[^\w.-]+/g, "-").slice(-80);
        upload(`website-requests/${kind}/${safeName}`, file, {
          access: "public",
          handleUploadUrl: "/api/site/upload",
          contentType: file.type,
          multipart: file.size > 5 * 1024 * 1024,
          onUploadProgress: ({ percentage }) => patchFile(id, { progress: percentage }),
        })
          .then((blob) => patchFile(id, { url: blob.url, status: "ready", progress: 100 }))
          .catch((e: unknown) => patchFile(id, { status: "error", error: e instanceof Error ? e.message : "Upload failed" }));
      }
    }
  }

  function removeFile(id: number) {
    setFiles((cur) => {
      const f = cur.find((x) => x.id === id);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      if (f?.kind === "logo") setDetected([]);
      return cur.filter((x) => x.id !== id);
    });
  }

  async function analyse() {
    if (description.trim().length < 10) {
      setError("Write a sentence or two about your restaurant first.");
      return;
    }
    setError(null);
    setReadingIndex(0);
    setStep("reading");
    const form = new FormData();
    form.set("description", description);
    form.set("logoColours", JSON.stringify(detected));
    const ready = files.filter((f) => f.status === "ready");
    if (blobEnabled) {
      form.set("files", JSON.stringify(ready.filter((f) => f.url).map((f) => ({ kind: f.kind, url: f.url, type: f.file.type }))));
    } else {
      for (const f of ready) form.append(`inline:${f.kind}`, f.file, f.file.name);
    }
    try {
      const res = await fetch("/api/site/analyse", { method: "POST", body: form });
      const json = (await res.json()) as AnalyseResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Something went wrong reading your details.");
      const features = [...new Set([...json.fields.features, ...initialFeatures])];
      setFields({ ...json.fields, features });
      setFound(json.found);
      setExtractedWith(json.extractedWith);
      setAnswers((a) => ({
        ...a,
        pages: [
          ...new Set([
            ...a.pages,
            ...(features.includes("customer-app") ? ["Order online"] : []),
            ...(features.includes("table-booking") ? ["Book a table"] : []),
            ...(files.some((f) => f.kind === "photo") ? ["Gallery"] : []),
          ]),
        ],
        domainChoice: json.fields.website ? "have" : a.domainChoice,
        domain: a.domain || json.fields.website.replace(/^https?:\/\//, "").replace(/\/.*$/, ""),
      }));
      setContact((c) => ({ ...c, email: c.email || json.fields.email, phone: c.phone || json.fields.phone }));
      // Let the last "reading" line show for a beat so the step doesn't flash past.
      setReadingIndex(READING_STEPS.length - 1);
      window.setTimeout(() => setStep("review"), 500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setStep("describe");
    }
  }

  async function submit() {
    if (!contact.name.trim() || !contact.email.trim()) {
      setError("Add your name and email so we can send you the preview.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await submitWebsiteRequestAction({
      description,
      fields,
      extractedWith,
      files: files.map((f) => ({ kind: f.kind, name: f.file.name, url: f.url, size: f.file.size })),
      contact,
      answers,
    }).catch(() => ({ ok: false as const, error: "Couldn't send your brief — check your connection and try again." }));
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRef(result.ref);
    setStep("done");
  }

  const set = <K extends keyof BriefFields>(key: K, value: BriefFields[K]) => setFields((f) => ({ ...f, [key]: value }));
  const logo = files.find((f) => f.kind === "logo");

  return (
    <div ref={topRef} className="scroll-mt-32">
      <Progress step={step} />

      {step === "describe" && (
        <div className="mt-10">
          <h1 className="text-center font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Tell us about your <span className="bg-gradient-to-r from-teal-200 to-emerald-200 bg-clip-text text-transparent">restaurant.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-white/55">
            What you cook, where you are, how it should feel and what the website needs to do. Paste your address, hours or contact details if they&apos;re handy — we&apos;ll pick them out.
          </p>

          <div className="relative mt-9">
            <div className="absolute -inset-px rounded-[26px] bg-gradient-to-r from-teal-300/50 via-emerald-200/20 to-cyan-400/50 blur-[2px]" />
            <div className="relative rounded-[25px] bg-[#0C1015] p-5 sm:p-6">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
                rows={7}
                autoFocus
                aria-label="Describe your restaurant and the website you want"
                placeholder={
                  "e.g. We're Spice Lane, a family-run Indian and Nepalese restaurant at 42 Kirkgate, Leeds LS2 7DJ. Open Mon–Thu 5–10pm, Fri–Sat 12–11pm. Call 0113 496 0123. We'd like a warm, modern site in our green and gold, with online ordering and table booking."
                }
                className="w-full resize-y bg-transparent text-[17px] leading-relaxed text-white placeholder:text-white/30 focus:outline-none"
              />
              <div className="mt-2 text-right text-xs text-white/30">
                {description.length} / {MAX_DESCRIPTION}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {(Object.keys(KIND_INFO) as Kind[]).map((kind) => (
                  <DropZone key={kind} kind={kind} count={files.filter((f) => f.kind === kind).length} onFiles={(l) => addFiles(kind, l)} />
                ))}
              </div>

              {files.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2.5 pr-3">
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                        <img src={f.preview} alt="" className="h-10 w-10 rounded-lg bg-white object-contain" />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 text-white/60">
                          <FileText className="h-5 w-5" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-white">{f.file.name}</div>
                        <div className="text-xs text-white/40">
                          {KIND_INFO[f.kind].label} · {formatSize(f.file.size)}
                          {f.status === "uploading" && ` · uploading ${Math.round(f.progress)}%`}
                          {f.status === "error" && <span className="text-rose-300"> · {f.error}</span>}
                        </div>
                      </div>
                      {f.status === "uploading" ? <LoaderCircle className="h-4 w-4 animate-spin text-teal-300" /> : f.status === "ready" ? <Check className="h-4 w-4 text-teal-300" /> : null}
                      <button type="button" onClick={() => removeFile(f.id)} className="rounded-md p-1 text-white/40 hover:bg-white/5 hover:text-white" aria-label={`Remove ${f.file.name}`}>
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {detected.length > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-white/50">
                  Colours from your logo:
                  {detected.map((c) => (
                    <span key={c} className="h-5 w-5 rounded-full ring-1 ring-white/20" style={{ background: c }} title={c} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <ErrorNote message={error} />}

          <div className="mt-7 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={analyse}
              disabled={busy}
              className="flex items-center gap-2 rounded-full bg-teal-400 px-7 py-4 text-lg font-semibold text-[#04201F] shadow-[0_0_50px_-8px_rgba(45,212,191,0.9)] hover:bg-teal-300 disabled:opacity-50"
            >
              <Sparkles className="h-5 w-5" /> {busy ? "Uploading…" : "Read my details"}
            </button>
            <p className="text-sm text-white/40">Nothing is sent to us until you review it and press Send.</p>
          </div>
        </div>
      )}

      {step === "reading" && (
        <div className="mx-auto mt-16 max-w-md rounded-3xl border border-white/[0.08] bg-[#0C1015]/80 p-8 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-400/15 text-teal-200">
              <Sparkles className="h-5 w-5" />
              <span className="absolute inset-0 animate-ping rounded-2xl bg-teal-400/20" />
            </span>
            <div className="font-display text-2xl font-bold">Reading your details…</div>
          </div>
          <ul className="mt-7 flex flex-col gap-3.5">
            {READING_STEPS.map((label, i) => (
              <li key={label} className={`flex items-center gap-3 text-[15px] transition-colors ${i <= readingIndex ? "text-white" : "text-white/30"}`}>
                {i < readingIndex ? (
                  <Check className="h-4 w-4 text-teal-300" strokeWidth={3} />
                ) : i === readingIndex ? (
                  <LoaderCircle className="h-4 w-4 animate-spin text-teal-300" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-white/15" />
                )}
                {label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {step === "review" && (
        <div className="mt-10">
          <StepHeading
            title="Here's what we found."
            body={`${found.length > 0 ? `We filled in ${found.length} things for you` : "We couldn't pick much out — no problem, fill in what you can"}. Check them over and fix anything that's off.`}
            badge={extractedWith === "ai" ? "Filled in with AI" : "Filled in automatically"}
          />

          <Card title="Your restaurant">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Restaurant name" required found={found.includes("restaurantName")} value={fields.restaurantName} onChange={(v) => set("restaurantName", v)} />
              <Field label="Cuisine or type" found={found.includes("cuisine")} value={fields.cuisine} onChange={(v) => set("cuisine", v)} placeholder="e.g. Indian, Café, Pizza" />
              <Field label="Address" className="sm:col-span-2" found={found.includes("address")} value={fields.address} onChange={(v) => set("address", v)} placeholder="Street, town, postcode" />
              <Field label="Phone for customers" found={found.includes("phone")} value={fields.phone} onChange={(v) => set("phone", v)} />
              <Field label="Email for customers" found={found.includes("email")} value={fields.email} onChange={(v) => set("email", v)} />
              <Field label="Current website" found={found.includes("website")} value={fields.website} onChange={(v) => set("website", v)} placeholder="If you have one" />
              <Field label="Instagram" found={found.includes("instagram")} value={fields.instagram} onChange={(v) => set("instagram", v)} placeholder="@yourplace" />
              <Field label="Opening hours" multiline className="sm:col-span-2" found={found.includes("openingHours")} value={fields.openingHours} onChange={(v) => set("openingHours", v)} placeholder={"Mon–Thu 17:00–22:00\nFri–Sat 12:00–23:00"} />
              <Field label="About you (for the website)" multiline className="sm:col-span-2" found={found.includes("about")} value={fields.about} onChange={(v) => set("about", v)} />
            </div>
          </Card>

          <Card title="Brand">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                {logo?.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
                  <img src={logo.preview} alt="Your logo" className="h-16 w-16 rounded-xl bg-white object-contain p-1" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-white/15 text-white/30">
                    <ImageIcon className="h-6 w-6" />
                  </span>
                )}
                <div className="text-sm text-white/50">{logo ? logo.file.name : "No logo yet — you can send it later."}</div>
              </div>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm text-white/60">
                  Colours {found.includes("colours") && <FoundTag />}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {fields.colours.map((c, i) => (
                    <div key={i} className="group relative">
                      <label className="block h-10 w-10 cursor-pointer overflow-hidden rounded-full ring-2 ring-white/15" style={{ background: c }} title={c}>
                        <input
                          type="color"
                          value={c}
                          onChange={(e) => set("colours", fields.colours.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))}
                          className="h-0 w-0 opacity-0"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => set("colours", fields.colours.filter((_, j) => j !== i))}
                        className="absolute -right-1 -top-1 hidden rounded-full bg-black p-0.5 text-white/70 ring-1 ring-white/20 group-hover:block"
                        aria-label={`Remove ${c}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {fields.colours.length < 5 && (
                    <button
                      type="button"
                      onClick={() => set("colours", [...fields.colours, "#14BDBD"])}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-white/20 text-white/50 hover:text-white"
                      aria-label="Add a colour"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card
            title="Menu"
            aside={
              found.includes("menuItems") ? (
                <span className="flex items-center gap-2 text-sm text-white/50">
                  {fields.menuItems.length} dishes <FoundTag />
                </span>
              ) : null
            }
          >
            {fields.menuItems.length === 0 ? (
              <p className="text-[15px] text-white/50">
                {files.some((f) => f.kind === "menu")
                  ? "We couldn't read dishes from your menu file — that's fine, we'll take them from the file itself."
                  : "No menu yet. Add a few signature dishes below, or send the menu later."}
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {(showAllMenu ? fields.menuItems : fields.menuItems.slice(0, 10)).map((item, i) => (
                  <div key={i} className="grid grid-cols-[1fr_90px_auto] gap-2 sm:grid-cols-[1fr_160px_100px_auto]">
                    <input
                      value={item.name}
                      onChange={(e) => set("menuItems", fields.menuItems.map((m, j) => (j === i ? { ...m, name: e.target.value } : m)))}
                      className="input-site"
                      aria-label="Dish name"
                    />
                    <input
                      value={item.category}
                      onChange={(e) => set("menuItems", fields.menuItems.map((m, j) => (j === i ? { ...m, category: e.target.value } : m)))}
                      className="input-site hidden sm:block"
                      placeholder="Category"
                      aria-label="Category"
                    />
                    <input
                      value={item.price}
                      onChange={(e) => set("menuItems", fields.menuItems.map((m, j) => (j === i ? { ...m, price: e.target.value } : m)))}
                      className="input-site"
                      placeholder="Price"
                      aria-label="Price"
                    />
                    <button type="button" onClick={() => set("menuItems", fields.menuItems.filter((_, j) => j !== i))} className="rounded-lg px-2 text-white/40 hover:text-white" aria-label="Remove dish">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {fields.menuItems.length > 10 && (
                  <button type="button" onClick={() => setShowAllMenu((v) => !v)} className="self-start text-sm font-semibold text-teal-300">
                    {showAllMenu ? "Show fewer" : `Show all ${fields.menuItems.length}`}
                  </button>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                set("menuItems", [...fields.menuItems, { name: "", price: "", category: "" }]);
                setShowAllMenu(true);
              }}
              className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-teal-300"
            >
              <Plus className="h-4 w-4" /> Add a dish
            </button>
          </Card>

          {error && <ErrorNote message={error} />}
          <NavButtons
            onBack={() => setStep("describe")}
            onNext={() => {
              if (!fields.restaurantName.trim()) {
                setError("Add your restaurant's name to carry on.");
                return;
              }
              setError(null);
              setStep("details");
            }}
            nextLabel="Next: a few questions"
          />
        </div>
      )}

      {step === "details" && (
        <div className="mt-10">
          <StepHeading title="Just a few more things." body="These help us get the first version right. Skip anything you're not sure about." />

          <Card title="What should IQ set up for you?">
            <div className="grid gap-2 sm:grid-cols-2">
              {PRODUCTS.map((p) => {
                const on = fields.features.includes(p.slug);
                return (
                  <button
                    key={p.slug}
                    type="button"
                    onClick={() => set("features", on ? fields.features.filter((s) => s !== p.slug) : [...fields.features, p.slug])}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${on ? "border-teal-300/50 bg-teal-300/[0.07]" : "border-white/[0.08] hover:border-white/20"}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? "bg-teal-300 text-[#04201F]" : "bg-white/5 text-white/60"}`}>
                      {on ? <Check className="h-4 w-4" strokeWidth={3} /> : <ProductIcon name={p.icon} className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-white">{p.name}</span>
                      <span className="block truncate text-xs text-white/45">{p.tagline}</span>
                    </span>
                    <StatusBadge status={p.status} />
                  </button>
                );
              })}
            </div>
          </Card>

          <Card title="How should the website feel?">
            <ChipGroup options={BRIEF_STYLES} selected={answers.style ? [answers.style] : []} onToggle={(v) => setAnswers((a) => ({ ...a, style: a.style === v ? "" : v }))} />
          </Card>

          <Card title="Which pages do you want?">
            <ChipGroup
              options={BRIEF_PAGES}
              selected={answers.pages}
              onToggle={(v) => setAnswers((a) => ({ ...a, pages: a.pages.includes(v) ? a.pages.filter((p) => p !== v) : [...a.pages, v] }))}
            />
          </Card>

          <Card title="Domain">
            <div className="flex flex-col gap-2">
              {(
                [
                  ["have", "I have a domain"],
                  ["need", "I need a new domain"],
                  ["later", "Decide later — start on a free IQ address"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-3 text-[15px] text-white/80">
                  <input
                    type="radio"
                    name="domain"
                    checked={answers.domainChoice === value}
                    onChange={() => setAnswers((a) => ({ ...a, domainChoice: value }))}
                    className="h-4 w-4 accent-teal-400"
                  />
                  {label}
                </label>
              ))}
              {answers.domainChoice !== "later" && (
                <input
                  value={answers.domain}
                  onChange={(e) => setAnswers((a) => ({ ...a, domain: e.target.value }))}
                  placeholder={answers.domainChoice === "have" ? "yourrestaurant.co.uk" : "Any names you'd like?"}
                  className="input-site mt-2 max-w-md"
                />
              )}
            </div>
          </Card>

          <Card title="Timing & POS">
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-sm text-white/60">When would you like it live?</div>
                <ChipGroup
                  options={["As soon as possible", "Within a month", "Just exploring"]}
                  selected={answers.timeline ? [answers.timeline] : []}
                  onToggle={(v) => setAnswers((a) => ({ ...a, timeline: a.timeline === v ? "" : v }))}
                />
              </div>
              <div>
                <div className="mb-2 text-sm text-white/60">Do you use IQ POS already?</div>
                <ChipGroup
                  options={["Yes", "No", "Interested"]}
                  selected={[answers.usesIqPos === "yes" ? "Yes" : answers.usesIqPos === "no" ? "No" : "Interested"]}
                  onToggle={(v) => setAnswers((a) => ({ ...a, usesIqPos: v === "Yes" ? "yes" : v === "No" ? "no" : "interested" }))}
                />
              </div>
            </div>
            <div className="mt-6">
              <Field label="Anything else we should know?" multiline value={answers.notes} onChange={(v) => setAnswers((a) => ({ ...a, notes: v }))} placeholder="Sites you like, things to avoid, special events…" />
            </div>
          </Card>

          <Card title="Where should we send your preview?">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Your name" required value={contact.name} onChange={(v) => setContact((c) => ({ ...c, name: v }))} />
              <Field label="Email" required value={contact.email} onChange={(v) => setContact((c) => ({ ...c, email: v }))} type="email" />
              <Field label="Phone" value={contact.phone} onChange={(v) => setContact((c) => ({ ...c, phone: v }))} type="tel" />
            </div>
          </Card>

          {error && <ErrorNote message={error} />}
          <NavButtons onBack={() => setStep("review")} onNext={submit} nextLabel={submitting ? "Sending…" : "Send my brief"} disabled={submitting} />
        </div>
      )}

      {step === "done" && (
        <div className="mx-auto mt-14 max-w-xl text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-400 text-[#04201F] shadow-[0_0_60px_-8px_rgba(45,212,191,0.9)]">
            <Check className="h-8 w-8" strokeWidth={3} />
          </span>
          <h1 className="mt-7 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Brief received.</h1>
          <p className="mt-4 text-lg text-white/60">
            Thanks{contact.name ? `, ${contact.name.split(" ")[0]}` : ""}. We&apos;ll build the first version of {fields.restaurantName || "your site"} and email a preview link to {contact.email}.
          </p>
          <div className="mt-6 inline-block rounded-full border border-white/10 px-4 py-1.5 font-mono text-sm text-white/60">Reference {ref}</div>
          <ol className="mx-auto mt-10 flex max-w-md flex-col gap-4 text-left">
            {["We review your brief and files — usually within one working day.", "You get a preview link to try on your phone.", "Tell us what to change, then we put it live on your domain."].map((t, i) => (
              <li key={t} className="flex gap-4">
                <span className="font-mono text-sm text-teal-300">0{i + 1}</span>
                <span className="text-white/70">{t}</span>
              </li>
            ))}
          </ol>
          <Link href={base || "/"} className="mt-10 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-semibold hover:border-white/30">
            <ArrowLeft className="h-4 w-4" /> Back to IQ
          </Link>
        </div>
      )}
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  const items = ["Describe", "Review", "Details", "Done"];
  const index = step === "describe" || step === "reading" ? 0 : step === "review" ? 1 : step === "details" ? 2 : 3;
  return (
    <ol className="mx-auto flex max-w-lg items-center justify-between gap-2">
      {items.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              i < index ? "bg-teal-400 text-[#04201F]" : i === index ? "bg-white text-[#07090D]" : "bg-white/5 text-white/40 ring-1 ring-white/10"
            }`}
          >
            {i < index ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
          </span>
          <span className={`hidden text-sm sm:inline ${i <= index ? "text-white" : "text-white/40"}`}>{label}</span>
          {i < items.length - 1 && <span className={`h-px flex-1 ${i < index ? "bg-teal-400/60" : "bg-white/10"}`} />}
        </li>
      ))}
    </ol>
  );
}

function DropZone({ kind, count, onFiles }: { kind: Kind; count: number; onFiles: (list: FileList | null) => void }) {
  const info = KIND_INFO[kind];
  const [over, setOver] = useState(false);
  const full = kind !== "logo" && count >= info.max;
  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!full) onFiles(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed p-4 transition ${
        over ? "border-teal-300 bg-teal-300/10" : "border-white/15 hover:border-white/30 hover:bg-white/[0.02]"
      } ${full ? "pointer-events-none opacity-40" : ""}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-teal-200">
        <Upload className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-white">
          {count > 0 && kind === "logo" ? "Change logo" : `Add ${info.label.toLowerCase()}`}
          {count > 0 && kind !== "logo" && <span className="ml-1.5 text-white/40">({count})</span>}
        </span>
        <span className="block text-xs text-white/40">{info.hint}</span>
      </span>
      <input
        type="file"
        accept={info.accept}
        multiple={kind !== "logo"}
        className="sr-only"
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}

function StepHeading({ title, body, badge }: { title: string; body: string; badge?: string }) {
  return (
    <div className="mb-8 text-center">
      {badge && (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-300/25 bg-teal-300/[0.08] px-3 py-1 text-xs font-semibold text-teal-200">
          <Sparkles className="h-3.5 w-3.5" /> {badge}
        </span>
      )}
      <h1 className="mt-4 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
      <p className="mx-auto mt-3 max-w-xl text-white/55">{body}</p>
    </div>
  );
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-3xl border border-white/[0.08] bg-[#0C1015]/80 p-5 backdrop-blur sm:p-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold text-white">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function FoundTag() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-teal-300/10 px-2 py-0.5 text-[11px] font-semibold text-teal-200">
      <Sparkles className="h-3 w-3" /> Found
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  found,
  required,
  multiline,
  placeholder,
  className = "",
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  found?: boolean;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  type?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-center gap-2 text-sm text-white/60">
        {label}
        {required && <span className="text-teal-300">*</span>}
        {found && <FoundTag />}
      </span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder} className="input-site resize-y" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="input-site" />
      )}
    </label>
  );
}

function ChipGroup({ options, selected, onToggle }: { options: readonly string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            className={`rounded-full border px-4 py-2 text-sm transition ${on ? "border-teal-300 bg-teal-300 font-semibold text-[#04201F]" : "border-white/10 text-white/70 hover:border-white/25"}`}
          >
            {o}
          </button>
        );
      })}
    </div>
  );
}

function NavButtons({ onBack, onNext, nextLabel, disabled }: { onBack: () => void; onNext: () => void; nextLabel: string; disabled?: boolean }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3">
      <button type="button" onClick={onBack} className="flex items-center gap-2 rounded-full px-4 py-3 text-white/60 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={disabled}
        className="flex items-center gap-2 rounded-full bg-teal-400 px-6 py-3.5 font-semibold text-[#04201F] shadow-[0_0_40px_-8px_rgba(45,212,191,0.9)] hover:bg-teal-300 disabled:opacity-60"
      >
        {nextLabel} <ArrowRight className="h-4 w-4" />
      </button>
    </div>
  );
}

function ErrorNote({ message }: { message: string }) {
  return <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{message}</div>;
}
