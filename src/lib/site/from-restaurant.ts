import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, dishes, restaurants, siteProjects } from "@/db/schema";
import { createProject } from "./projects";

// "Build my website" for a business that already runs on IQ POS: the brief is filled from its own record —
// name, brand colour, logo, address/phone/email, opening hours, menu categories and dishes (with photos) —
// so the free designs come out populated. One project per business, found again by its request_id.

const requestIdFor = (restaurantId: string) => `restaurant:${restaurantId}`;

export async function findRestaurantProject(restaurantId: string): Promise<string | null> {
  const [row] = await db.select({ token: siteProjects.token }).from(siteProjects).where(eq(siteProjects.requestId, requestIdFor(restaurantId))).limit(1);
  return row?.token ?? null;
}

export async function createRestaurantProject(restaurantId: string, contactEmail: string): Promise<string> {
  const existing = await findRestaurantProject(restaurantId);
  if (existing) return existing;
  const [r] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
  if (!r) throw new Error("Business not found.");
  const cats = await db.select().from(categories).where(eq(categories.restaurantId, restaurantId)).orderBy(asc(categories.name));
  const rows = await db.select().from(dishes).where(eq(dishes.restaurantId, restaurantId)).orderBy(asc(dishes.name));
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const menuItems = rows
    .filter((d) => !d.outOfStock)
    .slice(0, 300)
    .map((d) => ({
      name: d.name,
      price: String(d.price),
      category: catName.get(d.categoryId) ?? "Menu",
      description: d.description ?? "",
      image: d.imageUrl && /^https:\/\//i.test(d.imageUrl) ? d.imageUrl : null,
    }));
  const hours = r.openTime && r.closeTime ? `Open daily ${r.openTime}–${r.closeTime}` : "";
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://pos.luvder.com";
  const orderUrl = r.onlineOrderingEnabled ? (r.customDomain ? `https://${r.customDomain}` : `${origin}/order/${r.slug}`) : "";
  return createProject({
    requestId: requestIdFor(restaurantId),
    name: r.name,
    contactEmail,
    brief: {
      fields: {
        restaurantName: r.name,
        cuisine: "",
        address: r.invoiceAddress ?? "",
        phone: r.invoicePhone ?? "",
        email: r.invoiceEmail ?? "",
        website: r.invoiceWebsite ?? "",
        instagram: "",
        openingHours: hours,
        about: "",
        tagline: "",
        colours: r.brandColor ? [r.brandColor] : [],
        menuItems,
        features: [],
        orderUrl,
      },
      answers: { style: "", pages: [], notes: "" },
      files: r.invoiceLogoUrl && /^https:\/\//i.test(r.invoiceLogoUrl) ? [{ kind: "logo", name: "logo", url: r.invoiceLogoUrl, size: 0 }] : [],
      description: "",
    },
  });
}
