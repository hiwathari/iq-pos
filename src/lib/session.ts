// Edge-safe session helpers (JWT sign/verify only — no bcrypt, no next/headers).
// Used by both middleware (edge runtime) and lib/auth.ts (Node runtime).
import { SignJWT, jwtVerify } from "jose";

export type Role = "super_admin" | "admin" | "staff";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
  restaurantId: string | null;
}

export const SESSION_COOKIE_NAME = "iq_pos_session";
export const IMPERSONATION_COOKIE_NAME = "iq_pos_impersonate";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing JWT_SECRET. Set it in .env.local (see .env.example).");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload) {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
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
