// Shared shapes for the free website designs. Pure data + pure functions: safe to run in the browser
// (live preview) and on the server (saving).

export type TemplateId = "noir" | "ember" | "fresh";

export interface MenuItem {
  name: string;
  price: string;
  description?: string;
  image?: string | null;
}
export interface MenuCategory {
  category: string;
  items: MenuItem[];
}

/** Everything a design needs to know about the business — from the /build brief or from IQ POS itself. */
export interface SiteData {
  name: string;
  tagline: string;
  cuisine: string;
  about: string;
  phone: string;
  email: string;
  address: string;
  hours: string[];
  instagram: string;
  /** Online-ordering page, when the business has one (an "Order online" button points here). */
  orderUrl: string | null;
  logoUrl: string | null;
  photos: string[];
  menu: MenuCategory[];
}

export interface Design {
  template: TemplateId;
  primary: string;
  accent: string;
  mode: "dark" | "light";
  headingFont: string;
  bodyFont: string;
}

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  blurb: string;
  defaults: Design;
}
