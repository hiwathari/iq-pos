import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import {
  IMPERSONATION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  signSessionToken,
  verifySessionToken,
  type Role,
  type SessionPayload,
} from "./session";

export type { Role, SessionPayload };
export { verifySessionToken };

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(payload: SessionPayload) {
  const token = await signSessionToken(payload);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function destroySession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
  store.delete(IMPERSONATION_COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

// Super admins can "manage as" a specific restaurant; this cookie tracks which one.
export async function setImpersonatedRestaurant(restaurantId: string | null) {
  const store = await cookies();
  if (restaurantId) {
    store.set(IMPERSONATION_COOKIE_NAME, restaurantId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_DURATION_SECONDS,
    });
  } else {
    store.delete(IMPERSONATION_COOKIE_NAME);
  }
}

export async function getImpersonatedRestaurantId(): Promise<string | null> {
  const store = await cookies();
  return store.get(IMPERSONATION_COOKIE_NAME)?.value ?? null;
}

/** The restaurant the current request should operate on: the user's own for admin/staff, or the impersonated one for super admins. */
export async function getActiveRestaurantId(session: SessionPayload): Promise<string | null> {
  if (session.role === "super_admin") {
    return getImpersonatedRestaurantId();
  }
  return session.restaurantId;
}
