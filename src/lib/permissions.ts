import type { Role } from "@/lib/session";

// Every section of the app a "staff" role could be individually granted or denied. Admins,
// regional admins, and super admins (impersonating) always have every permission implicitly —
// this list only ever restricts the "staff" role.
export const PERMISSION_KEYS = [
  "dashboard",
  "order-line",
  "kitchen",
  "manage-table",
  "manage-dishes",
  "pricing",
  "coupons",
  "loyalty",
  "inventory",
  "suppliers",
  "purchase-orders",
  "stocktake",
  "promotions",
  "customers",
  "reports",
  "settings",
  "help-center",
  "end-day",
  "till-discount",
  "sales-records",
  "till-price-override",
  "till-refund",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  dashboard: "Dashboard",
  "order-line": "Till",
  kitchen: "Kitchen Display",
  "manage-table": "Manage Table",
  "manage-dishes": "Manage Dishes",
  pricing: "Channel Pricing",
  coupons: "Coupons",
  loyalty: "Loyalty Cards",
  inventory: "Stock / Inventory",
  suppliers: "Suppliers",
  "purchase-orders": "Purchase orders",
  stocktake: "Stocktake",
  promotions: "Promotions",
  customers: "Customers",
  reports: "Reports",
  settings: "Settings",
  "help-center": "Help Center",
  "end-day": "End Day Closing",
  "till-discount": "Give Discounts on Till",
  "sales-records": "Sales Records (edit/delete orders & End Day reports)",
  "till-price-override": "Change a price on the Till (reduced, damaged…)",
  "till-refund": "Refunds & exchanges on the Till",
};

// What a brand-new staff member can see/use before an admin customizes it — matches this app's
// long-standing staff-vs-admin split (staff could always reach these, nothing else) so turning
// on the permission system doesn't change anyone's access on day one.
export const DEFAULT_STAFF_PERMISSIONS: PermissionKey[] = [
  "dashboard",
  "order-line",
  "kitchen",
  "manage-table",
  "customers",
  "help-center",
  "end-day",
];

/** Every role except "staff" has full access everywhere within its own scope. */
export function hasPermission(role: Role, permissions: string[] | null | undefined, key: PermissionKey): boolean {
  if (role !== "staff") return true;
  const granted = permissions ?? DEFAULT_STAFF_PERMISSIONS;
  return granted.includes(key);
}
