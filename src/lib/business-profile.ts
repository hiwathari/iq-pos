import type { BusinessType, OrderChannel } from "@/lib/types";

// What a business of each type sees and is called — the one place screens ask instead of
// checking businessType themselves (docs/retail-plan/02-business-types.md). Plain module: used by
// server pages, client components and server actions alike.

export const BUSINESS_TYPES: BusinessType[] = ["restaurant", "cafe", "grocery", "retail", "warehouse"];

// Features a business can switch on or off in Settings (restaurants.features overrides the type's
// default). Only ones that are built are listed in FEATURE_SETTINGS below; later phases add more.
export type FeatureKey = "tables" | "kitchenDisplay";

export type FeatureOverrides = Partial<Record<FeatureKey, boolean>>;

export interface BusinessProfile {
  type: BusinessType;
  label: string;
  hint: string;
  // Words that change with the type: "Dishes" vs "Products", "Restaurant" vs "Store"…
  words: { product: string; products: string; manageProducts: string; place: string };
  features: Record<FeatureKey, boolean>;
  // Order types the Till offers, in order; the first is the default for a new sale.
  channels: OrderChannel[];
  // A paid sale is finished at once (no kitchen / serve step) — counter service.
  counterService: boolean;
  receiptFooter: string;
  negativeStock: "allow" | "warn" | "block";
  defaultCategories: { name: string; taxRatePercent: number }[];
}

const FOOD_WORDS = { product: "Dish", products: "Dishes", manageProducts: "Manage Dishes", place: "Restaurant" };
const SHOP_WORDS = { product: "Product", products: "Products", manageProducts: "Products", place: "Store" };
const RESTAURANT_CHANNELS: OrderChannel[] = ["Dine in", "Wait List", "Take Away", "Delivery", "Online", "Third Party"];
const SHOP_CHANNELS: OrderChannel[] = ["In store", "Click & collect", "Delivery", "Online", "Third Party"];

const PROFILES: Record<BusinessType, BusinessProfile> = {
  restaurant: {
    type: "restaurant",
    label: "Restaurant",
    hint: "Tables, kitchen and serving",
    words: FOOD_WORDS,
    features: { tables: true, kitchenDisplay: true },
    channels: RESTAURANT_CHANNELS,
    counterService: false,
    receiptFooter: "Thank you for dining with us!",
    negativeStock: "allow",
    defaultCategories: [],
  },
  cafe: {
    type: "cafe",
    label: "Cafe",
    hint: "Counter service — paid orders finish straight away",
    words: { ...FOOD_WORDS, place: "Cafe" },
    features: { tables: true, kitchenDisplay: true },
    channels: RESTAURANT_CHANNELS,
    counterService: true,
    receiptFooter: "Thank you for visiting us!",
    negativeStock: "allow",
    defaultCategories: [],
  },
  grocery: {
    type: "grocery",
    label: "Grocery shop",
    hint: "Barcodes, loose goods by weight, stock",
    words: SHOP_WORDS,
    features: { tables: false, kitchenDisplay: false },
    channels: SHOP_CHANNELS,
    counterService: true,
    receiptFooter: "Thank you for shopping with us!",
    negativeStock: "allow",
    // UK VAT defaults — most food is zero-rated; check each product (a per-product override comes in Phase 2).
    defaultCategories: [
      { name: "Fruit & Veg", taxRatePercent: 0 },
      { name: "Bakery", taxRatePercent: 0 },
      { name: "Dairy & Eggs", taxRatePercent: 0 },
      { name: "Meat & Fish", taxRatePercent: 0 },
      { name: "Frozen", taxRatePercent: 0 },
      { name: "Cupboard", taxRatePercent: 0 },
      { name: "Drinks", taxRatePercent: 20 },
      { name: "Snacks & Sweets", taxRatePercent: 20 },
      { name: "Alcohol", taxRatePercent: 20 },
      { name: "Household", taxRatePercent: 20 },
      { name: "Health & Beauty", taxRatePercent: 20 },
    ],
  },
  retail: {
    type: "retail",
    label: "Retail shop",
    hint: "Clothing, gifts, phones, hardware…",
    words: SHOP_WORDS,
    features: { tables: false, kitchenDisplay: false },
    channels: SHOP_CHANNELS,
    counterService: true,
    receiptFooter: "Thank you for shopping with us!",
    negativeStock: "allow",
    defaultCategories: [{ name: "General", taxRatePercent: 20 }],
  },
  warehouse: {
    type: "warehouse",
    label: "Wholesale / warehouse",
    hint: "Trade counter, stock held, goods out",
    words: { ...SHOP_WORDS, place: "Warehouse" },
    features: { tables: false, kitchenDisplay: false },
    channels: ["In store", "Click & collect", "Delivery"],
    counterService: true,
    receiptFooter: "Thank you for your business.",
    negativeStock: "block",
    defaultCategories: [{ name: "General", taxRatePercent: 20 }],
  },
};

export function isBusinessType(value: unknown): value is BusinessType {
  return typeof value === "string" && (BUSINESS_TYPES as string[]).includes(value);
}

export function businessProfile(type: BusinessType | null | undefined, overrides?: FeatureOverrides | null): BusinessProfile {
  const base = PROFILES[isBusinessType(type) ? type : "restaurant"];
  if (!overrides) return base;
  const features = { ...base.features };
  for (const key of Object.keys(features) as FeatureKey[]) {
    if (typeof overrides[key] === "boolean") features[key] = overrides[key]!;
  }
  return { ...base, features };
}

// Settings → Features: the switches an owner can flip, with what each one changes.
export const FEATURE_SETTINGS: { key: FeatureKey; label: string; hint: string }[] = [
  { key: "tables", label: "Tables & guests", hint: "Table plan, guests, Wait List and table QR ordering on the Till." },
  { key: "kitchenDisplay", label: "Kitchen", hint: "Send to Kitchen and the Kitchen Display. Off: a paid sale finishes straight away." },
];

// Only the switches that differ from the type's default are stored, so a business that changes
// type picks up the new type's defaults for everything it never changed.
export function featureOverridesFor(type: BusinessType, wanted: Partial<Record<FeatureKey, boolean>>): FeatureOverrides | null {
  const defaults = PROFILES[type].features;
  const out: FeatureOverrides = {};
  for (const key of Object.keys(defaults) as FeatureKey[]) {
    if (typeof wanted[key] === "boolean" && wanted[key] !== defaults[key]) out[key] = wanted[key];
  }
  return Object.keys(out).length ? out : null;
}
