// Every report on the Reports page, grouped for the tab bar. Plain data (not a client module) so
// the server page can also read INSIGHT_TABS to decide whether to load getReportInsights.
export const TAB_GROUPS: { label: string; tabs: { slug: string; label: string }[] }[] = [
  {
    label: "Overview",
    tabs: [
      { slug: "dashboard", label: "Dashboard" },
      { slug: "overview", label: "Summary" },
      { slug: "trends", label: "Trends" },
    ],
  },
  {
    label: "Sales",
    tabs: [
      { slug: "items", label: "Items" },
      { slug: "category", label: "Categories" },
      { slug: "channel", label: "Channels" },
      { slug: "payment", label: "Payment Methods" },
      { slug: "discounts", label: "Discounts & Coupons" },
      { slug: "tax", label: "Tax" },
    ],
  },
  {
    label: "Operations",
    tabs: [
      { slug: "waiter", label: "Staff" },
      { slug: "tables", label: "Tables" },
      { slug: "speed", label: "Kitchen Speed" },
      { slug: "voids", label: "Voids" },
      { slug: "online", label: "Online Orders" },
      { slug: "offline", label: "Offline Orders" },
      { slug: "bookings", label: "Bookings" },
      { slug: "stock", label: "Stock" },
    ],
  },
  {
    label: "Money",
    tabs: [
      { slug: "daily", label: "Daily Summary" },
      { slug: "weekly", label: "Weekly Summary" },
      { slug: "endday", label: "End Day" },
      { slug: "pettycash", label: "Petty Cash" },
      { slug: "cardsettlements", label: "Card Settlements" },
    ],
  },
  {
    label: "Customers",
    tabs: [{ slug: "customers", label: "Customers & Loyalty" }],
  },
  {
    label: "Shop",
    tabs: [
      { slug: "shopdash", label: "Shop Dashboard" },
      { slug: "margin", label: "Margin" },
      { slug: "stockvalue", label: "Stock Value" },
      { slug: "movements", label: "Stock Movements" },
      { slug: "losses", label: "Stock Losses" },
      { slug: "dead", label: "Dead Stock" },
      { slug: "weight", label: "Weight Sold" },
      { slug: "refundsr", label: "Refunds" },
      { slug: "promos", label: "Promotions" },
      { slug: "agechecks", label: "Age Checks" },
      { slug: "supplierspend", label: "Supplier Spend" },
      { slug: "expiry", label: "Expiry" },
      { slug: "agedebt", label: "Trade Debt" },
      { slug: "multisite", label: "All Sites" },
    ],
  },
];

// Reports that live in the "Shop" group (computed by lib/data/shop-reports.ts).
export const SHOP_TABS = TAB_GROUPS.find((g) => g.label === "Shop")!.tabs.map((t) => t.slug);

// Tabs that don't apply to this business are left out of the tab bar (restaurant tabs for a shop,
// shop tabs for a restaurant), following the same feature switches as the sidebar.
export function hiddenReportTabs(features: Partial<Record<string, boolean>>, multiSite: boolean): string[] {
  const hidden: string[] = [];
  if (!features.tables) hidden.push("tables", "bookings");
  if (!features.kitchenDisplay) hidden.push("speed");
  if (!features.purchasing) hidden.push(...SHOP_TABS);
  if (!features.promotions) hidden.push("promos");
  if (!features.batches) hidden.push("expiry");
  if (!features.tradeAccounts) hidden.push("agedebt");
  if (!multiSite) hidden.push("multisite");
  return hidden;
}

export const INSIGHT_TABS = ["dashboard", "items", "discounts", "tax", "tables", "speed", "voids", "stock", "endday", "customers", "waiter"];
