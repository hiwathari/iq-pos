// A separate, minimal session for loyalty customers signing in via magic link — deliberately
// not the staff/admin SessionPayload in src/lib/session.ts, since a loyalty member isn't a
// `users` row and should never carry any operational (Till/Kitchen/admin) access.
import { SignJWT, jwtVerify } from "jose";

export interface LoyaltySessionPayload {
  loyaltyMemberId: string;
  restaurantId: string;
  code: string;
}

export const LOYALTY_SESSION_COOKIE_NAME = "iq_pos_loyalty_session";
// Long-lived — signing back in just re-shows a card and order history, so there's little
// downside to staying signed in, and no magic-link email should be needed every visit.
export const LOYALTY_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 180;

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET. Set it in .env.local (see .env.example).");
  }
  return new TextEncoder().encode(secret);
}

export async function signLoyaltySessionToken(payload: LoyaltySessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${LOYALTY_SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyLoyaltySessionToken(token: string): Promise<LoyaltySessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as LoyaltySessionPayload;
  } catch {
    return null;
  }
}
