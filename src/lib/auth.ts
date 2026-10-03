import "server-only";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import {
  DEVICE_RESTAURANT_COOKIE_NAME,
  DEVICE_RESTAURANT_MAX_AGE_SECONDS,
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

export async function createSession(payload: SessionPayload, maxAgeSeconds: number = SESSION_DURATION_SECONDS) {
  const token = await signSessionToken(payload, maxAgeSeconds);
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
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

/** The restaurant the current request should operate on: the user's own for admin/staff, or the impersonated one for super/regional admins. */
export async function getActiveRestaurantId(session: SessionPayload): Promise<string | null> {
  if (session.role === "super_admin" || session.role === "regional_admin") {
    return getImpersonatedRestaurantId();
  }
  return session.restaurantId;
}

// Called at every successful PIN/password login that resolves to a specific restaurant — not
// super_admin/regional_admin, which aren't tied to one. Lets a shared device's own login screen
// show that restaurant's branding from then on, surviving logout (see DEVICE_RESTAURANT_COOKIE_NAME).
export async function rememberDeviceRestaurant(restaurantId: string) {
  const store = await cookies();
  store.set(DEVICE_RESTAURANT_COOKIE_NAME, restaurantId, {
    httpOnly: false, // read by server components rendering the login screen; not sensitive.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_RESTAURANT_MAX_AGE_SECONDS,
  });
}

export async function getRememberedDeviceRestaurantId(): Promise<string | null> {
  const store = await cookies();
  return store.get(DEVICE_RESTAURANT_COOKIE_NAME)?.value ?? null;
}
