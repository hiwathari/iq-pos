"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/scope";
import { setKillSwitch } from "@/lib/kill-switch";

// Super Admin only — a regional admin must not be able to switch the platform off (or back on).
export async function setKillSwitchAction(on: boolean): Promise<{ ok: true; on: boolean }> {
  const session = await requireSession();
  if (session.role !== "super_admin") throw new Error("Forbidden");
  await setKillSwitch(on);
  revalidatePath("/super-admin");
  return { ok: true, on };
}
