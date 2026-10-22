// Shared between the /build page (client) and the analyse/submit endpoints (server): the fields
// a website brief is pre-filled with, and the answers the sender adds on the review step.

export interface MenuItemGuess {
  name: string;
  price: string;
  category: string;
}

export interface BriefFields {
  restaurantName: string;
  cuisine: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  openingHours: string;
  about: string;
  colours: string[];
  menuItems: MenuItemGuess[];
  // Product slugs (see app/site/products.ts) the description mentions wanting.
  features: string[];
}

export const EMPTY_BRIEF: BriefFields = {
  restaurantName: "",
  cuisine: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  instagram: "",
  openingHours: "",
  about: "",
  colours: [],
  menuItems: [],
  features: [],
};

export interface AnalyseResult {
  fields: BriefFields;
  // Which fields were found, so the review step can mark them "found for you".
  found: (keyof BriefFields)[];
  extractedWith: "basic" | "ai";
}

export interface BriefFile {
  kind: "logo" | "menu" | "photo";
  name: string;
  // A Vercel Blob URL, or null when Blob storage isn't set up (only the name is kept then).
  url: string | null;
  size: number;
}

export const BRIEF_STYLES = ["Modern & minimal", "Warm & cosy", "Bold & colourful", "Classic & elegant", "Rustic", "Street food"] as const;
export const BRIEF_PAGES = ["Home", "Menu", "About us", "Gallery", "Contact & map", "Book a table", "Order online", "Reviews", "Events & catering"] as const;

export const MAX_DESCRIPTION = 6000;
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
// Without Blob storage, files travel inside the analyse request instead, which Vercel caps at
// ~4.5 MB per request — so the form keeps them under this in total.
export const MAX_INLINE_BYTES = 4 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

export function isBlobUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}
