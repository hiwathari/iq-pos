// How an icon is stored for a category or a floor (one text column, no extra tables):
//   "beef"            a legacy built-in icon key (the original 14 — a category's name may still pick a nicer one)
//   "lucide:<key>"    an icon chosen from the icon library (see ICON_KEYS in components/category-icon.tsx)
//   "emoji:🍕"        an emoji
//   "img:https://…"   an uploaded photo
// Plain module (no server-only imports) so the pickers and the server actions share it.

export const ICON_PREFIXES = ["lucide:", "emoji:", "img:"] as const;

export type ParsedIcon =
  | { kind: "emoji"; emoji: string }
  | { kind: "image"; url: string }
  | { kind: "lucide"; key: string }
  | { kind: "legacy"; key: string };

export function parseIconValue(value: string | null | undefined): ParsedIcon {
  const v = String(value ?? "");
  if (v.startsWith("emoji:")) return { kind: "emoji", emoji: v.slice(6) };
  if (v.startsWith("img:")) return { kind: "image", url: v.slice(4) };
  if (v.startsWith("lucide:")) return { kind: "lucide", key: v.slice(7) };
  return { kind: "legacy", key: v || "all" };
}

// A value that is safe to store, or null for "no icon chosen". Anything unexpected is dropped rather
// than saved — the value ends up in an <img src>, so only https photos are accepted.
export function cleanIconValue(input: string | null | undefined): string | null {
  const v = String(input ?? "").trim();
  if (!v) return null;
  if (v.startsWith("emoji:")) {
    const e = v.slice(6).trim();
    return e && [...e].length <= 8 ? `emoji:${e}` : null;
  }
  if (v.startsWith("img:")) {
    const url = v.slice(4).trim();
    return /^https:\/\/[^\s"'<>]{4,500}$/.test(url) ? `img:${url}` : null;
  }
  if (v.startsWith("lucide:")) return /^lucide:[a-z0-9-]{1,30}$/.test(v) ? v : null;
  return /^[a-z]{2,20}$/.test(v) ? v : null;
}
