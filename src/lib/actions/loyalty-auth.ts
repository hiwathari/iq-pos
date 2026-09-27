"use server";

import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { loyaltyMagicLinks, loyaltyMembers } from "@/db/schema";
import { getRestaurantBySlug } from "@/lib/data/restaurants";
import { sendLoyaltyMagicLinkEmail } from "@/lib/email";
import { LOYALTY_SESSION_COOKIE_NAME } from "@/lib/loyalty-session";

const TOKEN_TTL_MS = 15 * 60 * 1000;

export interface MagicLinkRequestState {
  error?: string;
  sent?: boolean;
}

// Bound with restaurantSlug (via .bind(null, slug)) before being handed to useActionState, so
// its signature here matches what that hook expects: (prevState, formData) after binding.
// Always resolves to the same "sent" response whether or not the email is enrolled, so this
// can't be used to enumerate which addresses have a loyalty card at this restaurant.
export async function requestLoyaltyMagicLinkAction(
  restaurantSlug: string,
  _prevState: MagicLinkRequestState,
  formData: FormData
): Promise<MagicLinkRequestState> {
  const email = String(formData.get("email") ?? "");
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { error: "Enter your email." };

  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) return { error: "Restaurant not found." };

  const [member] = await db
    .select()
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.restaurantId, restaurant.id), eq(loyaltyMembers.contactType, "email"), eq(loyaltyMembers.contactValue, trimmed)))
    .limit(1);

  if (member) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await db.insert(loyaltyMagicLinks).values({
      loyaltyMemberId: member.id,
      tokenHash,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    const origin = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const link = `${origin}/my-card/verify?token=${token}`;
    await sendLoyaltyMagicLinkEmail({ to: trimmed, restaurantName: restaurant.name, link });
  }

  return { sent: true };
}

export async function loyaltyLogoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(LOYALTY_SESSION_COOKIE_NAME);
  redirect("/my-card/signed-out");
}
