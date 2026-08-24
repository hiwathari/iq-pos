import "server-only";
import { redirect } from "next/navigation";
import { getActiveRestaurantId, getSession, type SessionPayload } from "./auth";

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireRestaurantContext(): Promise<{ session: SessionPayload; restaurantId: string }> {
  const session = await requireSession();
  const restaurantId = await getActiveRestaurantId(session);
  if (!restaurantId) redirect(session.role === "super_admin" ? "/super-admin" : "/login");
  return { session, restaurantId };
}

export function assertAdmin(session: SessionPayload) {
  if (session.role === "staff") redirect("/dashboard");
}
