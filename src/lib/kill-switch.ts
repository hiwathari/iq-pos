import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { platformSettings } from "@/db/schema";

// The platform-wide kill switch. Stored in platform_settings (key "kill_switch", value "on"/"off").
// While it's on, src/proxy.ts answers every request with 503 except static assets, the /login page and
// anything carrying a Super Admin session; loginAction / createSession also refuse everyone but a
// Super Admin. Deliberately has no "server-only" import: the proxy needs it too.
export const SETTING_KILL_SWITCH = "kill_switch";

// A few seconds of in-memory cache so the proxy doesn't read the DB on every request. Each server
// instance caches on its own, so a flip takes up to CACHE_MS to reach all of them (the instance that
// handled the toggle updates its own copy at once).
const CACHE_MS = 3000;
let cached: { on: boolean; at: number } | null = null;

export async function isKillSwitchOn(): Promise<boolean> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.on;
  try {
    const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, SETTING_KILL_SWITCH)).limit(1);
    cached = { on: row?.value === "on", at: now };
  } catch {
    // Can't read the flag (DB blip) — fail open rather than take the whole platform down on a hiccup.
    return cached?.on ?? false;
  }
  return cached.on;
}

export async function getKillSwitchStatus(): Promise<{ on: boolean; updatedAt: number | null }> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, SETTING_KILL_SWITCH)).limit(1);
  return { on: row?.value === "on", updatedAt: row?.updatedAt ?? null };
}

export async function setKillSwitch(on: boolean) {
  const value = on ? "on" : "off";
  const updatedAt = Date.now();
  await db
    .insert(platformSettings)
    .values({ key: SETTING_KILL_SWITCH, value, updatedAt })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt } });
  cached = { on, at: Date.now() };
}
