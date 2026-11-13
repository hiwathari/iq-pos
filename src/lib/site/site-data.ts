import { fontByFamily } from "./fonts";
import { defaultDesign, TEMPLATES, type Design, type MenuCategory, type SiteData } from "./templates";
import { isHex } from "./templates/kit";

// Turns a stored project brief into the SiteData the free designs render. Pure — safe in the browser too.

type Loose = Record<string, unknown>;
const text = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const httpsUrl = (v: unknown) => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/i.test(v.trim()) ? v.trim() : null);

export function briefToSiteData(brief: Loose, orderUrl: string | null = null): SiteData {
  const f = (brief.fields ?? {}) as Loose;
  const files = Array.isArray(brief.files) ? (brief.files as Loose[]) : [];
  const logo = files.find((x) => x.kind === "logo" && httpsUrl(x.url));
  const photos = files.filter((x) => x.kind === "photo").map((x) => httpsUrl(x.url)).filter((u): u is string => !!u);
  const items = Array.isArray(f.menuItems) ? (f.menuItems as Loose[]) : [];
  const byCat = new Map<string, MenuCategory>();
  for (const m of items.slice(0, 300)) {
    const name = text(m.name, 120);
    if (!name) continue;
    const cat = text(m.category, 60) || "Menu";
    if (!byCat.has(cat)) byCat.set(cat, { category: cat, items: [] });
    byCat.get(cat)!.items.push({ name, price: text(m.price, 20), description: text(m.description, 200) || undefined, image: httpsUrl(m.image) });
  }
  const hoursRaw = text(f.openingHours, 700);
  return {
    name: text(f.restaurantName, 120) || "Your restaurant",
    tagline: text(f.tagline, 140),
    cuisine: text(f.cuisine, 120),
    about: text(f.about, 1500),
    phone: text(f.phone, 40),
    email: text(f.email, 200),
    address: text(f.address, 300),
    hours: hoursRaw ? hoursRaw.split(/\r?\n|;/).map((l) => l.trim()).filter(Boolean).slice(0, 10) : [],
    instagram: text(f.instagram, 80),
    orderUrl: httpsUrl(orderUrl ?? f.orderUrl),
    logoUrl: logo ? httpsUrl(logo.url) : null,
    photos: [...new Set([...photos, ...[...byCat.values()].flatMap((c) => c.items.map((i) => i.image).filter((u): u is string => !!u))])].slice(0, 6),
    menu: [...byCat.values()],
  };
}

/** The saved design for a project (or the default for a template), validated. */
export function designFromBrief(brief: Loose): Design {
  const saved = (brief.design ?? {}) as Loose;
  const base = defaultDesign(TEMPLATES.some((t) => t.id === saved.template) ? (saved.template as string) : "noir");
  const colours = Array.isArray((brief.fields as Loose | undefined)?.colours) ? (((brief.fields as Loose).colours as unknown[]).filter((c) => typeof c === "string" && isHex(c)) as string[]) : [];
  return sanitiseDesign({
    ...base,
    primary: (saved.primary as string) ?? colours[0] ?? base.primary,
    accent: (saved.accent as string) ?? colours[1] ?? base.accent,
    mode: (saved.mode as Design["mode"]) ?? base.mode,
    headingFont: (saved.headingFont as string) ?? base.headingFont,
    bodyFont: (saved.bodyFont as string) ?? base.bodyFont,
  });
}

export function sanitiseDesign(d: Partial<Design>): Design {
  const template = TEMPLATES.find((t) => t.id === d.template)?.id ?? "noir";
  const base = defaultDesign(template);
  return {
    template,
    primary: d.primary && isHex(d.primary) ? d.primary : base.primary,
    accent: d.accent && isHex(d.accent) ? d.accent : base.accent,
    mode: d.mode === "light" || d.mode === "dark" ? d.mode : base.mode,
    headingFont: fontByFamily(d.headingFont ?? "")?.family ?? base.headingFont,
    bodyFont: fontByFamily(d.bodyFont ?? "")?.family ?? base.bodyFont,
  };
}

/** The text details a customer may edit on the Design tab (everything else comes from the stored brief). */
export type SiteDetails = Pick<SiteData, "name" | "tagline" | "cuisine" | "about" | "phone" | "email" | "address" | "instagram"> & { hours: string };

export const detailsFromData = (d: SiteData): SiteDetails => ({
  name: d.name,
  tagline: d.tagline,
  cuisine: d.cuisine,
  about: d.about,
  phone: d.phone,
  email: d.email,
  address: d.address,
  instagram: d.instagram,
  hours: d.hours.join("\n"),
});
