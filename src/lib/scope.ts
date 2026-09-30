import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { restaurantAccess, users } from "@/db/schema";
import { getActiveRestaurantId, getSession, type SessionPayload } from "./auth";
import { hasPermission, type PermissionKey } from "./permissions";

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireRestaurantContext(): Promise<{ session: SessionPayload; restaurantId: string }> {
  const session = await requireSession();
  const restaurantId = await getActiveRestaurantId(session);
  if (!restaurantId) redirect(session.role === "staff" || session.role === "admin" ? "/login" : "/super-admin");
  return { session, restaurantId };
}

export function assertAdmin(session: SessionPayload) {
  if (session.role === "staff") redirect("/dashboard");
}

// A regional_admin only has authority over restaurants explicitly assigned to them — this closes
// the gap assertAdmin leaves open (it only ever blocks "staff", so without this check a
// regional_admin could impersonate any restaurant ID, not just their assigned ones).
export async function assertRestaurantAccess(session: SessionPayload, restaurantId: string) {
  if (session.role !== "regional_admin") return;
  const rows = await db.select().from(restaurantAccess).where(eq(restaurantAccess.userId, session.userId));
  if (!rows.some((r) => r.restaurantId === restaurantId)) redirect("/super-admin");
}

// The one place that knows how to fetch a staff member's own granted permissions — used both by
// the page-level gate below and by app-shell for sidebar filtering.
export async function getUserPermissions(userId: string): Promise<string[] | null> {
  const [row] = await db.select({ permissions: users.permissions }).from(users).where(eq(users.id, userId));
  return row?.permissions ?? null;
}

// Page-level gate for a section a "staff" role might not have been granted — redirects home
// instead of rendering when denied. Every other role always passes.
export async function requirePermission(key: PermissionKey): Promise<{ session: SessionPayload; restaurantId: string }> {
  const { session, restaurantId } = await requireRestaurantContext();
  if (session.role === "staff") {
    const permissions = await getUserPermissions(session.userId);
    if (!hasPermission(session.role, permissions, key)) redirect("/dashboard");
  }
  return { session, restaurantId };
}

// Action-level counterpart to requirePermission — call after requireRestaurantContext() inside a
// server action that a permission-gated page's UI can trigger, so a staff member can't call the
// action directly (e.g. via devtools) without also holding the permission the page requires.
export async function assertPermission(session: SessionPayload, key: PermissionKey) {
  if (session.role !== "staff") return;
  const permissions = await getUserPermissions(session.userId);
  if (!hasPermission(session.role, permissions, key)) redirect("/dashboard");
}
