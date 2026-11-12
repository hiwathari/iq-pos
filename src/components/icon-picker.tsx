"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { CategoryIconView, ICON_LIBRARY } from "@/components/category-icon";
import { parseIconValue } from "@/lib/icon-value";

export const PICKER_EMOJIS = [
  "🍔", "🍕", "🍝", "🥗", "🍗", "🥩", "🍤", "🍜", "🍛", "🍣",
  "🥞", "🧇", "🥐", "🧁", "🍰", "🍮", "🍨", "🍫", "🥤", "☕",
  "🍹", "🌮", "🌯", "🥪", "🍟", "🍲", "🍅", "🥑", "🍳", "🥣",
  "🍎", "🍌", "🥛", "🥚", "🍞", "🧀", "🥫", "🧃", "🍷", "🍺",
  "🧴", "🧻", "🧼", "👕", "👟", "📱", "🔋", "🔧", "🎁", "📦",
  "🏠", "🌳", "☀️", "🌙", "⭐", "🔥", "❄️", "🎵", "🍃", "🛋️",
];

const MAX_SIDE = 512;

// Shrinks a picked photo before it is uploaded (icons and product photos never need to be bigger),
// so a phone photo of several MB becomes a few tens of KB. Falls back to the original file if the
// browser can't decode it.
async function shrinkImage(file: File): Promise<{ blob: Blob; ext: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const webp: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.85));
    if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
    const jpg: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (jpg) return { blob: jpg, ext: "jpg" };
  } catch {
    /* use the original */
  }
  return { blob: file, ext: file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg" };
}

export async function uploadIconPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file (JPG, PNG or WebP).");
  const { blob, ext } = await shrinkImage(file);
  const result = await upload(`app-icons/photo.${ext}`, blob, {
    access: "public",
    handleUploadUrl: "/api/upload/image",
    contentType: blob.type || undefined,
  });
  return result.url;
}

// Upload button + preview used by the dish form and the icon picker. onChange gets the new photo URL
// ("" when removed).
export function PhotoUpload({ url, onChange, label = "Upload photo" }: { url: string; onChange: (url: string) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadIconPhoto(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-14 w-14 rounded-xl border border-neutral-200 object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-neutral-300 text-neutral-300">
            <ImagePlus className="h-6 w-6" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {busy ? "Uploading…" : url ? "Change photo" : label}
          </button>
          {url && !busy && (
            <button type="button" onClick={() => onChange("")} className="flex items-center gap-1.5 text-xs font-medium text-rose-600 hover:underline">
              <Trash2 className="h-3.5 w-3.5" /> Remove photo
            </button>
          )}
        </div>
        <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose a photo" />
      </div>
      {error && <p className="mt-1.5 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

type Tab = "icons" | "emoji" | "photo";

// Choose an icon: from the icon library, an emoji (pick one or type your own), or an uploaded photo.
// `value` / `onChange` use the stored format of lib/icon-value.ts ("" = nothing chosen).
export function IconPicker({ value, onChange, nameHint, allowNone = true }: { value: string; onChange: (value: string) => void; nameHint?: string; allowNone?: boolean }) {
  const parsed = parseIconValue(value);
  const [tab, setTab] = useState<Tab>(parsed.kind === "emoji" ? "emoji" : parsed.kind === "image" ? "photo" : "icons");
  const [typed, setTyped] = useState("");
  const TABS: [Tab, string][] = [
    ["icons", "Icons"],
    ["emoji", "Emoji"],
    ["photo", "Photo"],
  ];

  return (
    <div className="rounded-xl border border-neutral-200 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-[var(--brand)]">
          {value ? <CategoryIconView icon={value} name={nameHint} className="h-6 w-6" /> : <span className="text-xs text-neutral-400">None</span>}
        </div>
        <div className="flex flex-1 gap-1 rounded-lg bg-neutral-100 p-0.5">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-md py-1 text-xs font-semibold ${tab === key ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {allowNone && value && (
          <button type="button" onClick={() => onChange("")} aria-label="Clear icon" title="Clear icon" className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {tab === "icons" && (
        <div className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto">
          {Object.entries(ICON_LIBRARY).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(`lucide:${key}`)}
              title={key}
              aria-label={`Icon ${key}`}
              className={`flex h-9 w-9 items-center justify-center rounded-lg text-neutral-600 ${value === `lucide:${key}` ? "bg-teal-100 text-[var(--brand)] ring-2 ring-[var(--brand)]" : "hover:bg-neutral-100"}`}
            >
              <Icon className="h-5 w-5" />
            </button>
          ))}
        </div>
      )}

      {tab === "emoji" && (
        <div>
          <div className="grid max-h-36 grid-cols-10 gap-1 overflow-y-auto">
            {PICKER_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => onChange(`emoji:${e}`)}
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg ${value === `emoji:${e}` ? "bg-teal-100 ring-2 ring-[var(--brand)]" : "hover:bg-neutral-100"}`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Or type / paste your own emoji"
              aria-label="Your own emoji"
              className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-teal-500"
            />
            <button
              type="button"
              disabled={!typed.trim()}
              onClick={() => {
                onChange(`emoji:${typed.trim()}`);
                setTyped("");
              }}
              className="rounded-lg bg-[var(--brand)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Use
            </button>
          </div>
        </div>
      )}

      {tab === "photo" && <PhotoUpload url={parsed.kind === "image" ? parsed.url : ""} onChange={(url) => onChange(url ? `img:${url}` : "")} />}
    </div>
  );
}
