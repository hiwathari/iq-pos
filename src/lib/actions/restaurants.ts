"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { categories, paymentTerminals, printers, restaurants, users } from "@/db/schema";
import { hashPassword, setImpersonatedRestaurant } from "@/lib/auth";
import { assertPermission, assertRestaurantAccess, requireRestaurantContext, requireSession } from "@/lib/scope";
import { isValidHexColor } from "@/lib/color";
import type { BusinessType } from "@/lib/types";

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `${base || "restaurant"}-${Math.random().toString(36).slice(2, 6)}`;
}

export interface CreateRestaurantState {
  error?: string;
}

export async function createRestaurantAction(
  _prevState: CreateRestaurantState | undefined,
  formData: FormData
): Promise<CreateRestaurantState> {
  const session = await requireSession();
  if (session.role !== "super_admin") return { error: "Forbidden." };

  const name = String(formData.get("name") || "").trim();
  const businessTypeRaw = String(formData.get("businessType") || "restaurant");
  const businessType: BusinessType = businessTypeRaw === "cafe" ? "cafe" : "restaurant";
  const adminName = String(formData.get("adminName") || "").trim();
  const adminEmail = String(formData.get("adminEmail") || "")
    .trim()
    .toLowerCase();
  const adminPassword = String(formData.get("adminPassword") || "");

  if (!name || !adminName || !adminEmail || !adminPassword) {
    return { error: "All fields are required." };
  }
  if (adminPassword.length < 8) {
    return { error: "Admin password must be at least 8 characters." };
  }

  const [existing] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);
  if (existing) {
    return { error: "That admin email is already in use." };
  }

  const restaurantId = crypto.randomUUID();
  const slug = slugify(name);
  await db.insert(restaurants).values({ id: restaurantId, name, slug, businessType });

  const passwordHash = await hashPassword(adminPassword);
  await db.insert(users).values({
    id: crypto.randomUUID(),
    email: adminEmail,
    passwordHash,
    name: adminName,
    role: "admin",
    restaurantId,
  });

  // Every restaurant gets a restricted "accounts" login alongside its admin — same password
  // (kept in sync by updateStaffCredentialsAction whenever the admin's changes), same page
  // access, but a filtered view of sales data (see lib/accounts-filter.ts). accounts@<the
  // admin's own domain> when that's free; otherwise disambiguated with the restaurant's slug,
  // since two unrelated restaurants' admins can land on the same free-mail-provider domain.
  const domain = adminEmail.split("@")[1];
  if (domain) {
    const plainAccountsEmail = `accounts@${domain}`;
    const [domainTaken] = await db.select({ id: users.id }).from(users).where(eq(users.email, plainAccountsEmail)).limit(1);
    const accountsEmail = domainTaken ? `accounts+${slug}@${domain}` : plainAccountsEmail;
    await db.insert(users).values({
      id: crypto.randomUUID(),
      email: accountsEmail,
      passwordHash,
      name: `${name} Accounts`,
      role: "accounts",
      restaurantId,
    });
  }

  const kitchenPrinterId = crypto.randomUUID();
  await db.insert(printers).values({
    id: kitchenPrinterId,
    restaurantId,
    name: "Kitchen Printer",
    station: "Kitchen",
    connection: "Network",
    isDefault: true,
  });

  await db.insert(paymentTerminals).values({ id: crypto.randomUUID(), restaurantId, name: "Card 1", isDefault: true });

  await db.insert(categories).values({
    id: crypto.randomUUID(),
    restaurantId,
    name: "General",
    icon: "all",
    printerId: kitchenPrinterId,
  });

  revalidatePath("/super-admin");
  return {};
}

export async function updateRestaurantCurrencyAction(currencySymbol: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  if (!currencySymbol.trim()) return;
  await db.update(restaurants).set({ currencySymbol: currencySymbol.trim() }).where(eq(restaurants.id, restaurantId));
  revalidatePath("/settings");
  revalidatePath("/order-line");
  revalidatePath("/manage-dishes");
  revalidatePath("/pricing");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
}

export async function updateRestaurantTaxEnabledAction(enabled: boolean) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db.update(restaurants).set({ taxEnabled: enabled }).where(eq(restaurants.id, restaurantId));
  revalidatePath("/settings");
  revalidatePath("/order-line");
  revalidatePath("/manage-dishes");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
}

export async function updateBusinessTypeAction(businessType: BusinessType) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db.update(restaurants).set({ businessType }).where(eq(restaurants.id, restaurantId));
  revalidatePath("/settings");
  revalidatePath("/order-line");
  revalidatePath("/kitchen");
}

export async function updateKitchenTimerLimitAction(minutes: number) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  const clamped = Math.min(120, Math.max(1, Math.round(minutes)));
  await db.update(restaurants).set({ kitchenTimerLimitMinutes: clamped }).where(eq(restaurants.id, restaurantId));
  revalidatePath("/settings");
  revalidatePath("/kitchen");
}

function isValidClockTime(value: string) {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value);
}

// Shop hours — openTime anchors the "business day" boundary used by the auto-void sweep and
// Kitchen Display's Completed panel (see lib/business-day.ts), so a shift that runs past
// midnight still counts as one day. Clearing a field (empty string) goes back to plain UTC
// midnight for that restaurant. Interpreted in UTC — there's no restaurant-timezone field.
export async function updateShopHoursAction(openTime: string, closeTime: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  if (openTime && !isValidClockTime(openTime)) return;
  if (closeTime && !isValidClockTime(closeTime)) return;
  await db
    .update(restaurants)
    .set({ openTime: openTime || null, closeTime: closeTime || null })
    .where(eq(restaurants.id, restaurantId));
  revalidatePath("/settings");
  revalidatePath("/kitchen");
  revalidatePath("/dashboard");
}

// Any admin can clear the "orders carried over from a previous day" banner — not just the one
// who happens to be logged in when it appears.
export async function dismissAutoVoidNoticeAction() {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "dashboard");
  await db.update(restaurants).set({ autoVoidNoticeDismissedAt: Date.now() }).where(eq(restaurants.id, restaurantId));
  revalidatePath("/dashboard");
}

export interface InvoiceDetailsInput {
  invoiceAddress: string;
  invoicePhone: string;
  invoiceWebsite: string;
  invoiceLogoUrl: string;
  invoiceFooterText: string;
}

export async function updateInvoiceDetailsAction(input: InvoiceDetailsInput) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "settings");
  await db
    .update(restaurants)
    .set({
      invoiceAddress: input.invoiceAddress.trim() || null,
      invoicePhone: input.invoicePhone.trim() || null,
      invoiceWebsite: input.invoiceWebsite.trim() || null,
      invoiceLogoUrl: input.invoiceLogoUrl.trim() || null,
      invoiceFooterText: input.invoiceFooterText.trim() || "Thank you for dining with us!",
    })
    .where(eq(restaurants.id, restaurantId));
  revalidatePath("/settings");
  revalidatePath("/order-line");
}

export interface UpdateBrandingState {
  error?: string;
}

// Platform-managed branding — deliberately Super Admin-only (not editable from the restaurant's
// own Settings) since it's set up once during onboarding rather than tweaked day-to-day.
export async function updateRestaurantBrandingAction(
  restaurantId: string,
  input: { logoUrl: string; brandColor: string }
): Promise<UpdateBrandingState> {
  const session = await requireSession();
  if (session.role !== "super_admin") return { error: "Forbidden." };

  const brandColor = input.brandColor.trim();
  if (brandColor && !isValidHexColor(brandColor)) {
    return { error: "Brand color must be a hex value like #0D9488." };
  }

  await db
    .update(restaurants)
    .set({
      invoiceLogoUrl: input.logoUrl.trim() || null,
      brandColor: brandColor || null,
    })
    .where(eq(restaurants.id, restaurantId));

  revalidatePath("/super-admin");
  revalidatePath("/dashboard");
  revalidatePath("/order-line");
  revalidatePath("/kitchen");
  return {};
}

export interface OnlineOrderingSettingsInput {
  onlineOrderingEnabled: boolean;
  qrTableOrderingEnabled: boolean;
  kioskOrderingEnabled: boolean;
  customDomain: string;
}

export interface UpdateOnlineOrderingState {
  error?: string;
}

const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/;

// Platform-managed, like branding — Super Admin decides which restaurants get a public ordering
// surface at all, since it opens a new, unauthenticated entry point into the restaurant's orders.
export async function updateRestaurantOnlineOrderingAction(
  restaurantId: string,
  input: OnlineOrderingSettingsInput
): Promise<UpdateOnlineOrderingState> {
  const session = await requireSession();
  if (session.role !== "super_admin") return { error: "Forbidden." };

  let customDomain: string | null = input.customDomain.trim().toLowerCase();
  customDomain = customDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!customDomain) customDomain = null;
  if (customDomain && !DOMAIN_RE.test(customDomain)) {
    return { error: "Enter a valid domain, e.g. order.yourrestaurant.com" };
  }

  if (customDomain) {
    const [clash] = await db.select({ id: restaurants.id }).from(restaurants).where(eq(restaurants.customDomain, customDomain));
    if (clash && clash.id !== restaurantId) return { error: "That domain is already in use by another restaurant." };
  }

  await db
    .update(restaurants)
    .set({
      onlineOrderingEnabled: input.onlineOrderingEnabled,
      qrTableOrderingEnabled: input.qrTableOrderingEnabled,
      kioskOrderingEnabled: input.kioskOrderingEnabled,
      customDomain,
    })
    .where(eq(restaurants.id, restaurantId));

  revalidatePath("/super-admin");
  return {};
}

export async function toggleRestaurantActiveAction(restaurantId: string, active: boolean) {
  const session = await requireSession();
  if (session.role !== "super_admin") throw new Error("Forbidden");
  await db.update(restaurants).set({ active }).where(eq(restaurants.id, restaurantId));
  revalidatePath("/super-admin");
}

export async function impersonateRestaurantAction(restaurantId: string) {
  const session = await requireSession();
  if (session.role !== "super_admin" && session.role !== "regional_admin") throw new Error("Forbidden");
  await assertRestaurantAccess(session, restaurantId);
  await setImpersonatedRestaurant(restaurantId);
  redirect("/dashboard");
}

export async function stopImpersonationAction() {
  const session = await requireSession();
  if (session.role !== "super_admin" && session.role !== "regional_admin") throw new Error("Forbidden");
  await setImpersonatedRestaurant(null);
  redirect("/super-admin");
}
