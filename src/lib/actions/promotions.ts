"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { promotions } from "@/db/schema";
import { assertPermission, requireRestaurantContext } from "@/lib/scope";
import type { PromoKind, PromoRules, PromoScope } from "@/lib/promotions";

// Promotions CRUD (step 5.3). Rules are validated per kind so a half-filled form can never save
// something the pricing code would silently ignore.

export interface PromotionInput {
  name: string;
  kind: PromoKind;
  rules: PromoRules;
  startsAt?: number | null;
  endsAt?: number | null;
  active?: boolean;
  channels?: string[] | null;
}

const KINDS: PromoKind[] = ["multibuy_price", "multibuy_free", "percent_off", "amount_off", "bundle"];

const cleanScope = (s?: PromoScope): PromoScope => ({
  productIds: (s?.productIds ?? []).filter((x) => typeof x === "string").slice(0, 500),
  categoryIds: (s?.categoryIds ?? []).filter((x) => typeof x === "string").slice(0, 100),
});
const hasScope = (s: PromoScope) => (s.productIds?.length ?? 0) + (s.categoryIds?.length ?? 0) > 0;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v));

function validate(input: PromotionInput): { error: string } | { name: string; rules: PromoRules } {
  const name = String(input.name ?? "").trim().slice(0, 80);
  if (!name) return { error: "Give the promotion a name." };
  if (!KINDS.includes(input.kind)) return { error: "Choose what kind of promotion it is." };
  const r = input.rules ?? {};
  const out: PromoRules = {};
  if (input.kind === "bundle") {
    const slots = (r.slots ?? []).map((s) => ({ name: String(s.name ?? "").trim().slice(0, 40) || undefined, scope: cleanScope(s.scope), count: Math.floor(num(s.count)) }));
    if (slots.length < 2) return { error: "A bundle needs at least two parts, e.g. a sandwich and a drink." };
    if (slots.some((s) => !hasScope(s.scope) || !(s.count >= 1))) return { error: "Every part of the bundle needs products or categories and a quantity." };
    const price = num(r.bundlePrice);
    if (!(price >= 0)) return { error: "Enter the bundle price." };
    out.slots = slots;
    out.bundlePrice = Math.round(price * 100) / 100;
  } else {
    const scope = cleanScope(r.scope);
    if (!hasScope(scope)) return { error: "Choose the products or categories it applies to." };
    out.scope = scope;
    if (input.kind === "multibuy_price") {
      const qty = Math.floor(num(r.qty));
      const price = num(r.price);
      if (!(qty >= 2)) return { error: "A multi-buy needs a quantity of 2 or more." };
      if (!(price >= 0)) return { error: "Enter the price for the group." };
      out.qty = qty;
      out.price = Math.round(price * 100) / 100;
    } else if (input.kind === "multibuy_free") {
      const buy = Math.floor(num(r.buy));
      const free = Math.floor(num(r.free));
      if (!(buy >= 1) || !(free >= 1)) return { error: "Enter how many to buy and how many are free." };
      out.buy = buy;
      out.free = free;
    } else if (input.kind === "percent_off") {
      const pct = num(r.percent);
      if (!(pct > 0 && pct <= 100)) return { error: "Enter a percentage between 1 and 100." };
      out.percent = pct;
    } else {
      const amt = num(r.amount);
      if (!(amt > 0)) return { error: "Enter the amount off." };
      out.amount = Math.round(amt * 100) / 100;
    }
  }
  return { name, rules: out };
}

export async function savePromotionAction(promotionId: string | null, input: PromotionInput): Promise<{ error?: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "promotions");
  const checked = validate(input);
  if ("error" in checked) return checked;
  const startsAt = input.startsAt ? Number(input.startsAt) : null;
  const endsAt = input.endsAt ? Number(input.endsAt) : null;
  if (startsAt && endsAt && endsAt <= startsAt) return { error: "The end must be after the start." };
  const values = {
    name: checked.name,
    kind: input.kind,
    rules: checked.rules,
    startsAt,
    endsAt,
    active: input.active !== false,
    channels: input.channels && input.channels.length ? input.channels.slice(0, 12) : null,
  };
  if (promotionId) {
    const [row] = await db.update(promotions).set(values).where(and(eq(promotions.id, promotionId), eq(promotions.restaurantId, restaurantId))).returning({ id: promotions.id });
    if (!row) return { error: "That promotion no longer exists." };
  } else {
    await db.insert(promotions).values({ restaurantId, ...values });
  }
  revalidatePath("/promotions");
  revalidatePath("/order-line");
  return {};
}

export async function setPromotionActiveAction(promotionId: string, active: boolean) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "promotions");
  await db.update(promotions).set({ active }).where(and(eq(promotions.id, promotionId), eq(promotions.restaurantId, restaurantId)));
  revalidatePath("/promotions");
  revalidatePath("/order-line");
}

export async function deletePromotionAction(promotionId: string) {
  const { session, restaurantId } = await requireRestaurantContext();
  await assertPermission(session, "promotions");
  await db.delete(promotions).where(and(eq(promotions.id, promotionId), eq(promotions.restaurantId, restaurantId)));
  revalidatePath("/promotions");
  revalidatePath("/order-line");
}
