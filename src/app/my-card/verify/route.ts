import { createHash } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { loyaltyMagicLinks, loyaltyMembers } from "@/db/schema";
import { LOYALTY_SESSION_COOKIE_NAME, LOYALTY_SESSION_DURATION_SECONDS, signLoyaltySessionToken } from "@/lib/loyalty-session";

// A GET Route Handler (not a Server Action) because setting a cookie from a plain link click
// requires the request/response cycle a Route Handler gives — a Server Component can't do it.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL("/my-card/error", request.url));

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const [link] = await db.select().from(loyaltyMagicLinks).where(eq(loyaltyMagicLinks.tokenHash, tokenHash)).limit(1);

  if (!link || link.usedAt || link.expiresAt < Date.now()) {
    return NextResponse.redirect(new URL("/my-card/error", request.url));
  }

  const [member] = await db.select().from(loyaltyMembers).where(eq(loyaltyMembers.id, link.loyaltyMemberId)).limit(1);
  if (!member) return NextResponse.redirect(new URL("/my-card/error", request.url));

  await db.update(loyaltyMagicLinks).set({ usedAt: Date.now() }).where(eq(loyaltyMagicLinks.id, link.id));

  const sessionToken = await signLoyaltySessionToken({
    loyaltyMemberId: member.id,
    restaurantId: member.restaurantId,
    code: member.code,
  });

  // redirectTo is always server-set at request time (never a client-supplied query param), but
  // still checked defensively — it must stay a relative in-app path.
  const destination =
    link.redirectTo && link.redirectTo.startsWith("/") && !link.redirectTo.startsWith("//") && !link.redirectTo.includes("\\")
      ? link.redirectTo
      : "/my-card";
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set(LOYALTY_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: LOYALTY_SESSION_DURATION_SECONDS,
    path: "/",
  });
  return response;
}
