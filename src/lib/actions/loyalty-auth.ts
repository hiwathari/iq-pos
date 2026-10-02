"use server";

import { randomBytes, createHash, randomInt } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { loyaltyMagicLinks, loyaltyMembers } from "@/db/schema";
import { getRestaurantBySlug } from "@/lib/data/restaurants";
import { sendLoyaltyMagicLinkEmail } from "@/lib/email";
import { generateLoyaltyCode } from "@/lib/loyalty-code";
import { LOYALTY_SESSION_COOKIE_NAME, LOYALTY_SESSION_DURATION_SECONDS, signLoyaltySessionToken } from "@/lib/loyalty-session";

const TOKEN_TTL_MS = 15 * 60 * 1000;

// Only ever a relative in-app path — guards against an open redirect even though this value is
// always server-set today (never taken directly from a client-supplied query param).
function safeRedirectPath(path: string | null | undefined, fallback: string) {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return fallback;
  return path;
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

// A restaurant with its own custom ordering domain (set in Super Admin > Online Ordering — see
// restaurants.customDomain) gets its magic-link emails built against that domain instead of the
// platform's own, since that's the address its customers actually know and trust. Falls back to
// the platform URL for every restaurant that hasn't set one.
function resolveOrigin(customDomain: string | null) {
  if (customDomain) return `https://${customDomain}`;
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

async function createSignInRequest(loyaltyMemberId: string, redirectTo: string, customDomain: string | null) {
  const token = randomBytes(32).toString("hex");
  const code = String(randomInt(100000, 1000000));
  await db.insert(loyaltyMagicLinks).values({
    loyaltyMemberId,
    tokenHash: hashSecret(token),
    codeHash: hashSecret(code),
    redirectTo,
    expiresAt: Date.now() + TOKEN_TTL_MS,
  });
  const link = `${resolveOrigin(customDomain)}/my-card/verify?token=${token}`;
  return { link, code };
}

async function establishLoyaltySession(loyaltyMemberId: string, restaurantId: string, code: string) {
  const sessionToken = await signLoyaltySessionToken({ loyaltyMemberId, restaurantId, code });
  const cookieStore = await cookies();
  cookieStore.set(LOYALTY_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: LOYALTY_SESSION_DURATION_SECONDS,
    path: "/",
  });
}

export interface MagicLinkRequestState {
  error?: string;
  sent?: boolean;
}

// Bound with restaurantSlug (via .bind(null, slug)) before being handed to useActionState, so
// its signature here matches what that hook expects: (prevState, formData) after binding.
// Always resolves to the same "sent" response whether or not the email is enrolled, so this
// can't be used to enumerate which addresses have a loyalty card at this restaurant. Does NOT
// create a new member — that's only for the ordering signup flow below.
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
    const { link, code } = await createSignInRequest(member.id, "/my-card", restaurant.customDomain);
    await sendLoyaltyMagicLinkEmail({ to: trimmed, restaurantName: restaurant.name, link, code });
  }

  return { sent: true };
}

export interface OnlineOrderSignInState {
  error?: string;
  sent?: boolean;
  email?: string;
}

// The customer ordering flow's own sign-in/signup: creates a loyalty member on first use (this
// IS the signup step), so — unlike requestLoyaltyMagicLinkAction — its response legitimately
// differs for a brand-new address (a member gets created either way, so there's nothing to
// enumerate). Gated on onlineOrderingEnabled so a disabled restaurant's link can't be used to
// collect emails or place orders at all.
export async function requestOnlineOrderSignInAction(
  restaurantSlug: string,
  redirectTo: string,
  _prevState: OnlineOrderSignInState,
  formData: FormData
): Promise<OnlineOrderSignInState> {
  const email = String(formData.get("email") ?? "");
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { error: "Enter your email." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { error: "Enter a valid email address." };

  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant || !restaurant.onlineOrderingEnabled) return { error: "Online ordering isn't available for this restaurant." };

  let [member] = await db
    .select()
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.restaurantId, restaurant.id), eq(loyaltyMembers.contactType, "email"), eq(loyaltyMembers.contactValue, trimmed)))
    .limit(1);

  if (!member) {
    const code = generateLoyaltyCode(restaurant.name);
    [member] = await db
      .insert(loyaltyMembers)
      .values({ restaurantId: restaurant.id, contactType: "email", contactValue: trimmed, code })
      .returning();
  }

  const safePath = safeRedirectPath(redirectTo, `/order/${restaurantSlug}`);
  const { link, code } = await createSignInRequest(member.id, safePath, restaurant.customDomain);
  await sendLoyaltyMagicLinkEmail({ to: trimmed, restaurantName: restaurant.name, link, code });

  return { sent: true, email: trimmed };
}

export interface VerifyCodeState {
  error?: string;
}

// The typed-code counterpart to clicking the emailed link — verifying either one consumes the
// same sign-in request row. This runs as a real client-triggered Server Action (form submit), so
// — unlike the link's GET route — it's allowed to set the session cookie directly here.
export async function verifyLoginCodeAction(
  restaurantSlug: string,
  fallbackRedirect: string,
  _prevState: VerifyCodeState,
  formData: FormData
): Promise<VerifyCodeState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  if (!email || !code) return { error: "Enter your email and the code from the email." };

  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) return { error: "Restaurant not found." };

  const [member] = await db
    .select()
    .from(loyaltyMembers)
    .where(and(eq(loyaltyMembers.restaurantId, restaurant.id), eq(loyaltyMembers.contactType, "email"), eq(loyaltyMembers.contactValue, email)))
    .limit(1);
  if (!member) return { error: "That code isn't valid or has expired." };

  const codeHash = hashSecret(code);
  const [link] = await db
    .select()
    .from(loyaltyMagicLinks)
    .where(and(eq(loyaltyMagicLinks.loyaltyMemberId, member.id), eq(loyaltyMagicLinks.codeHash, codeHash)))
    .limit(1);
  if (!link || link.usedAt || link.expiresAt < Date.now()) return { error: "That code isn't valid or has expired." };

  await db.update(loyaltyMagicLinks).set({ usedAt: Date.now() }).where(eq(loyaltyMagicLinks.id, link.id));
  await establishLoyaltySession(member.id, member.restaurantId, member.code);

  redirect(safeRedirectPath(link.redirectTo, fallbackRedirect));
}

export async function loyaltyLogoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(LOYALTY_SESSION_COOKIE_NAME);
  redirect("/my-card/signed-out");
}
