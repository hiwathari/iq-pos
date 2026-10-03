// Edge-safe session helpers (JWT sign/verify only — no bcrypt, no next/headers).
// Used by both middleware (edge runtime) and lib/auth.ts (Node runtime).
import { SignJWT, jwtVerify } from "jose";

// "till" and "kitchen_display" are ephemeral device sessions minted by a 6-digit PIN
// (see lib/actions/pin-auth.ts) — they never correspond to a stored user role.
// "regional_admin" is a scoped super_admin — see restaurantAccess in db/schema.ts.
// "accounts" is a restricted, auto-created bookkeeping login for a restaurant's own admin — same
// page access as admin, but Dashboard/Reports only show cash + the default payment terminal in
// full, with every other terminal limited to the trailing 14 days (see lib/accounts-filter.ts).
export type Role = "super_admin" | "regional_admin" | "admin" | "staff" | "till" | "kitchen_display" | "accounts";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  restaurantId: string | null;
  // Only set when a kitchen_display session was minted by a dedicated display's own PIN (see
  // kitchenPinLoginAction) rather than a staff member's personal kitchen PIN — the station that
  // screen defaults to on load, instead of the station-less "All" view every other kitchen_display
  // session starts on.
  displayStation?: "Kitchen" | "Bar" | "Receipt" | "Expo" | null;
}

export const SESSION_COOKIE_NAME = "iq_pos_session";
export const IMPERSONATION_COOKIE_NAME = "iq_pos_impersonate";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days
// Not a security boundary — just a UI convenience so a shared device's own login screen (Till,
// Kitchen, Staff PIN) shows that restaurant's own logo/name instead of the generic brand mark,
// once it's been signed into at least once. Set at every successful login, never cleared by
// logout, so it survives across PIN-unlock cycles on the same device. See lib/auth.ts.
export const DEVICE_RESTAURANT_COOKIE_NAME = "iq_pos_device_restaurant";
export const DEVICE_RESTAURANT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET. Set it in .env.local (see .env.example).");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload, expiresInSeconds: number = SESSION_DURATION_SECONDS) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
