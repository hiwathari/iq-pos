// Fonts offered in the website builder (all free Google Fonts). Safe to import from client code.
export interface SiteFont {
  family: string;
  /** Google Fonts weight list ("400;600;700"), or null for single-weight fonts. */
  weights: string | null;
  kind: "heading" | "body";
  fallback: string;
}

export const FONTS: SiteFont[] = [
  { family: "Playfair Display", weights: "400;600;700", kind: "heading", fallback: "Georgia, serif" },
  { family: "Cormorant Garamond", weights: "400;600;700", kind: "heading", fallback: "Georgia, serif" },
  { family: "DM Serif Display", weights: null, kind: "heading", fallback: "Georgia, serif" },
  { family: "Abril Fatface", weights: null, kind: "heading", fallback: "Georgia, serif" },
  { family: "Lora", weights: "400;600;700", kind: "heading", fallback: "Georgia, serif" },
  { family: "Oswald", weights: "400;500;600;700", kind: "heading", fallback: "Impact, sans-serif" },
  { family: "Bebas Neue", weights: null, kind: "heading", fallback: "Impact, sans-serif" },
  { family: "Montserrat", weights: "400;600;700;800", kind: "heading", fallback: "Arial, sans-serif" },
  { family: "Poppins", weights: "400;500;600;700", kind: "heading", fallback: "Arial, sans-serif" },
  { family: "Inter", weights: "400;500;600;700", kind: "body", fallback: "Arial, sans-serif" },
  { family: "DM Sans", weights: "400;500;700", kind: "body", fallback: "Arial, sans-serif" },
  { family: "Lato", weights: "400;700", kind: "body", fallback: "Arial, sans-serif" },
  { family: "Open Sans", weights: "400;600;700", kind: "body", fallback: "Arial, sans-serif" },
  { family: "Nunito", weights: "400;600;700", kind: "body", fallback: "Arial, sans-serif" },
  { family: "Source Sans 3", weights: "400;600;700", kind: "body", fallback: "Arial, sans-serif" },
  { family: "Roboto", weights: "400;500;700", kind: "body", fallback: "Arial, sans-serif" },
];

export const fontByFamily = (family: string) => FONTS.find((f) => f.family.toLowerCase() === family.trim().toLowerCase());

export const fontStack = (family: string) => {
  const f = fontByFamily(family);
  return f ? `'${f.family}', ${f.fallback}` : "Georgia, serif";
};

/** One Google Fonts stylesheet URL covering the given families (unknown families are ignored). */
export function googleFontsUrl(families: string[]): string | null {
  const unique = [...new Set(families.map((x) => fontByFamily(x)).filter((f): f is SiteFont => !!f))];
  if (unique.length === 0) return null;
  const parts = unique.map((f) => `family=${f.family.replace(/ /g, "+")}${f.weights ? `:wght@${f.weights}` : ""}`);
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

export const googleFontsImport = (families: string[]) => {
  const url = googleFontsUrl(families);
  return url ? `@import url('${url}');\n` : "";
}

/** Every curated family in one URL — loaded in the editor canvas so any of them can be picked in the style manager. */
export const ALL_FONTS_URL = googleFontsUrl(FONTS.map((f) => f.family))!;
