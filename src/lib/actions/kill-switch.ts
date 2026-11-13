"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/scope";
import { getRestaurantKillLevel, setKillSwitch, setRestaurantKillSwitch } from "@/lib/kill-switch";

// Super Admin only — a regional admin must not be able to switch the platform off (or back on).
export async function setKillSwitchAction(on: boolean): Promise<{ ok: true; on: boolean }> {
  const session = await requireSession();
  if (session.role !== "super_admin") throw new Error("Forbidden");
  await setKillSwitch(on);
  revalidatePath("/super-admin");
  return { ok: true, on };
}

// One business. Super Admin can switch any business off ("super": locked — the business's own admin can't
// undo it) or back on. A business's admin can switch their own business off and on ("admin": their dashboard
// keeps working so they can undo it) — but not lift a Super Admin lock.
export async function setRestaurantKillSwitchAction(restaurantId: string, on: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  const current = await getRestaurantKillLevel(restaurantId);
  if (session.role === "super_admin") {
    await setRestaurantKillSwitch(restaurantId, on ? "super" : null);
  } else if (session.role === "admin" && session.restaurantId === restaurantId) {
    if (current === "super") return { ok: false, error: "The platform owner has switched this business off. Contact them to switch it back on." };
    await setRestaurantKillSwitch(restaurantId, on ? "admin" : null);
  } else {
    throw new Error("Forbidden");
  }
  revalidatePath("/super-admin");
  revalidatePath("/dashboard");
  return { ok: true };
}
