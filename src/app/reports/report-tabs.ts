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
];

export const INSIGHT_TABS = ["dashboard", "items", "discounts", "tax", "tables", "speed", "voids", "stock", "endday", "customers", "waiter"];
