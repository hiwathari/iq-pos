import type { AnalyseResult, BriefFields, MenuItemGuess } from "./brief";
import { EMPTY_BRIEF } from "./brief";
import { PRODUCTS } from "./products";

// Pattern-based pre-fill for the /build brief — what runs when no AI key is saved in Super
// Admin (and the fallback if the AI call fails). It only has to get the obvious things right:
// the review step shows every field for the sender to correct, so a miss costs a few seconds of
// typing, never a wrong submission.

const CUISINES = [
  "Indian", "Pakistani", "Bangladeshi", "Nepalese", "Sri Lankan", "Italian", "Pizza", "Chinese", "Cantonese", "Thai",
  "Japanese", "Sushi", "Korean", "Vietnamese", "Malaysian", "Mexican", "Turkish", "Lebanese", "Middle Eastern",
  "Persian", "Mediterranean", "Greek", "Spanish", "Tapas", "French", "American", "Burgers", "Steakhouse", "Seafood",
  "Fish and chips", "Caribbean", "African", "Ethiopian", "Vegan", "Vegetarian", "Brunch", "Bakery", "Desserts",
  "Coffee", "Café", "Cafe", "Chai", "Tea room", "Bubble tea", "Juice bar", "Bar", "Pub", "Grill", "Kebab", "Fusion",
  "Street food", "Fine dining",
];

const COLOUR_NAMES: Record<string, string> = {
  black: "#111111", white: "#FFFFFF", cream: "#F5EFE0", beige: "#D9C8A9", gold: "#C9A227", yellow: "#F2C230",
  orange: "#E8772E", red: "#C62828", burgundy: "#7A1F2B", maroon: "#6D1A24", pink: "#E88AA8", purple: "#6A3FA0",
  navy: "#1B2A4A", blue: "#2563EB", teal: "#0B8584", turquoise: "#14BDBD", green: "#2E7D32", olive: "#6B7A2A",
  brown: "#6B4226", grey: "#8A8F98", gray: "#8A8F98", silver: "#C0C4CC", charcoal: "#33363B", terracotta: "#C2603F",
};

const DAY = "(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|s)?";
const TIME = "\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?";
const HOURS_RE = new RegExp(`${DAY}(?:\\s*(?:-|–|to|&|and|,)\\s*${DAY})*\\s*:?\\s*(?:${TIME}\\s*(?:-|–|to|till|until)\\s*${TIME}|closed)`, "gi");
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:co\.uk|org\.uk|com|uk|net|org|io|co|cafe|restaurant|menu|kitchen|london|shop)(?:\/[^\s,)]*)?/gi;
const PRICE_LINE_RE = /^(.{2,70}?)[\s.·…_-]*[£$€]\s?(\d{1,3}(?:[.,]\d{1,2})?)\s*$|^(.{2,70}?)[\s.·…_-]+(\d{1,3}[.,]\d{2})\s*$/;

function clean(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function findName(text: string) {
  const patterns = [
    /(?:called|named|name is|name's|brand is|restaurant is)\s+["“']?([A-Z0-9][\w'’&.-]*(?:\s+(?:[A-Z0-9&][\w'’&.-]*|of|the|and|de|la|le|al)){0,5})/,
    /(?:^|[.!?]\s+)(?:We(?:'re| are)|This is)\s+["“']?([A-Z][\w'’&.-]*(?:\s+[A-Z&][\w'’&.-]*){0,4})["”']?(?:[,.]|\s+(?:a|an|the)\b)/,
    /^["“']?([A-Z][\w'’&.-]*(?:\s+[A-Z&][\w'’&.-]*){0,4})["”']?\s+(?:is|are)\s+(?:a|an|the|our)\b/m,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return clean(m[1]).replace(/[.,]$/, "");
  }
  return "";
}

function findPhone(text: string) {
  const candidates = text.match(/(?:\+|\b0)[\d\s().-]{8,18}\d/g) ?? [];
  for (const c of candidates) {
    const digits = c.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 13) return clean(c);
  }
  return "";
}

function findAddress(text: string) {
  const labelled = text.match(/(?:address|located at|find us at|we(?:'re| are) at|based at)\s*[:\-]?\s*([^\n]{6,120})/i);
  if (labelled) return clean(labelled[1]).replace(/[.;]$/, "");
  const lines = text.split(/\n/);
  const line = lines.find((l) => POSTCODE_RE.test(l));
  if (!line) return "";
  // Keep the address part of a sentence like "We're on 12 High Street, Leeds LS1 4AB and …".
  const m = line.match(/(\d{1,4}[A-Za-z]?\s+[^,\n]{2,40}(?:,\s*[^,\n]{2,30}){0,3}?\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
  return clean(m ? m[1] : line.match(POSTCODE_RE)![0].toUpperCase());
}

function findColours(text: string) {
  const out: string[] = [];
  for (const m of text.matchAll(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi)) out.push(m[0].toUpperCase());
  const colourContext = text.match(/(?:colou?rs?|brand|palette|theme)[^.\n]{0,80}/gi) ?? [];
  for (const chunk of colourContext) {
    for (const [name, hex] of Object.entries(COLOUR_NAMES)) {
      if (new RegExp(`\\b${name}\\b`, "i").test(chunk)) out.push(hex);
    }
  }
  return [...new Set(out)].slice(0, 5);
}

// Menu lines look like "Chicken Biryani ...... £9.50" or "Masala Chai 2.80" — anything that
// doesn't is either a category heading (short, no price, often in capitals) or prose to skip.
export function findMenuItems(text: string): MenuItemGuess[] {
  const items: MenuItemGuess[] = [];
  let category = "";
  for (const raw of text.split(/\n/)) {
    const line = clean(raw);
    if (!line) continue;
    const m = line.match(PRICE_LINE_RE);
    if (m) {
      const name = clean((m[1] ?? m[3] ?? "").replace(/[\s.·…_-]+$/, ""));
      const price = (m[2] ?? m[4] ?? "").replace(",", ".");
      if (name.length >= 2 && /[a-z]/i.test(name) && !/^(total|subtotal|vat|service)/i.test(name)) {
        items.push({ name, price: Number(price).toFixed(2), category });
      }
      continue;
    }
    if (line.length <= 32 && !/[.!?]$/.test(line) && /[a-z]/i.test(line) && line.split(" ").length <= 4) {
      category = line.replace(/:$/, "");
    }
  }
  const seen = new Set<string>();
  return items.filter((i) => !seen.has(i.name.toLowerCase()) && seen.add(i.name.toLowerCase())).slice(0, 120);
}

export function extractBasic(description: string, menuText: string): AnalyseResult {
  const text = description.replace(/\r/g, "");
  const fields: BriefFields = { ...EMPTY_BRIEF, colours: [], menuItems: [], features: [] };

  fields.email = text.match(EMAIL_RE)?.[0] ?? "";
  const withoutEmails = text.replace(new RegExp(EMAIL_RE.source, "gi"), " ");
  const insta = withoutEmails.match(/instagram\.com\/([\w.]{2,30})|(?:insta(?:gram)?\s*[:\-]?\s*|^|\s)@([\w.]{2,30})/im);
  fields.instagram = insta ? `@${(insta[1] ?? insta[2]).replace(/\.$/, "")}` : "";
  const site = (withoutEmails.match(URL_RE) ?? []).find((u) => !/instagram|facebook|tiktok|google|ubereats|deliveroo|just-?eat/i.test(u));
  fields.website = site ? site.replace(/[.)]$/, "") : "";
  fields.phone = findPhone(withoutEmails);
  fields.address = findAddress(text);
  fields.restaurantName = findName(text);

  const lower = ` ${text.toLowerCase()} `;
  fields.cuisine = CUISINES.filter((c) => new RegExp(`\\b${c.toLowerCase()}\\b`).test(lower))
    .filter((c, i, all) => !(c === "Cafe" && all.includes("Café")))
    .slice(0, 3)
    .join(", ");

  const hours = text.match(HOURS_RE) ?? [];
  fields.openingHours = hours.map(clean).join("\n");
  fields.colours = findColours(text);
  fields.features = PRODUCTS.filter((p) => p.keywords.some((k) => lower.includes(k))).map((p) => p.slug);
  fields.menuItems = findMenuItems(`${menuText}\n${text}`);
  // The description itself is the best "about" draft — the first couple of sentences of it.
  // Contact and hours sentences are skipped — they already have their own fields.
  const prose = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => !/@|\d{3,}|address|open\b|call us/i.test(s));
  fields.about = clean(prose.slice(0, 3).join(" ")).slice(0, 400);

  const found = (Object.keys(fields) as (keyof BriefFields)[]).filter((k) => {
    const v = fields[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  return { fields, found, extractedWith: "basic" };
}
