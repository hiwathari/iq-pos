import { eq, like, or } from "drizzle-orm";
import { db } from "@/db/client";
import { platformSettings } from "@/db/schema";

// Kill switches, stored in platform_settings:
//   "kill_switch"                → the whole platform ("on" / "off"; Super Admin only).
//   "kill_switch:<restaurantId>" → one business: "admin" (switched off by that business's admin — their own
//                                  dashboard still works so they can switch it back on) or "super" (switched
//                                  off by Super Admin — locked, nobody at that business can get in, and the
//                                  admin can't undo it). No row = running.
// While a switch is on, src/proxy.ts answers requests with 503 except static assets, the /login page and
// Super Admin sessions; sign-ins are refused too. Deliberately no "server-only" import: the proxy needs it.
export const SETTING_KILL_SWITCH = "kill_switch";
export const RESTAURANT_KILL_PREFIX = "kill_switch:";

export type KillLevel = "admin" | "super";
export interface KillState {
  global: boolean;
  restaurants: Record<string, KillLevel>;
}

// A few seconds of in-memory cache so the proxy doesn't read the DB on every request — one query loads
// the global flag and every business's flag. Each server instance caches on its own, so a flip takes up
// to CACHE_MS to reach all of them (the instance that handled the toggle updates its own copy at once).
const CACHE_MS = 3000;
let cached: { state: KillState; at: number } | null = null;

const EMPTY: KillState = { global: false, restaurants: {} };

function parse(rows: { key: string; value: string }[]): KillState {
  const state: KillState = { global: false, restaurants: {} };
  for (const row of rows) {
    if (row.key === SETTING_KILL_SWITCH) state.global = row.value === "on";
    else if (row.key.startsWith(RESTAURANT_KILL_PREFIX) && (row.value === "admin" || row.value === "super")) {
      state.restaurants[row.key.slice(RESTAURANT_KILL_PREFIX.length)] = row.value;
    }
  }
  return state;
}

async function readState(): Promise<KillState> {
  const rows = await db
    .select({ key: platformSettings.key, value: platformSettings.value })
    .from(platformSettings)
    .where(or(eq(platformSettings.key, SETTING_KILL_SWITCH), like(platformSettings.key, `${RESTAURANT_KILL_PREFIX}%`)));
  return parse(rows);
}

export async function getKillState(): Promise<KillState> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.state;
  try {
    cached = { state: await readState(), at: now };
  } catch {
    // Can't read the flags (DB blip) — fail open rather than take the platform down on a hiccup.
    return cached?.state ?? EMPTY;
  }
  return cached.state;
}

export async function isKillSwitchOn(): Promise<boolean> {
  return (await getKillState()).global;
}

/** The switch level for one business, or null when it's running. (Ignores the global switch.) */
export async function getRestaurantKillLevel(restaurantId: string): Promise<KillLevel | null> {
  return (await getKillState()).restaurants[restaurantId] ?? null;
}

/**
 * Should this person be shut out right now? Super Admin never is. Everyone else is while the global switch
 * is on; and while their business is switched off — except that business's admin (and a regional admin
 * managing it) when the admin did it themselves, so they can switch it back on.
 */
export function isBlocked(state: KillState, who: { role: string; restaurantId: string | null }): boolean {
  if (who.role === "super_admin") return false;
  if (state.global) return true;
  if (!who.restaurantId) return false;
  const level = state.restaurants[who.restaurantId];
  if (!level) return false;
  if (level === "super") return true;
  return who.role !== "admin" && who.role !== "regional_admin";
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
  cached = { state: { ...(cached?.state ?? EMPTY), global: on }, at: Date.now() };
}

/** Switch one business off (level "admin" | "super") or back on (null). */
export async function setRestaurantKillSwitch(restaurantId: string, level: KillLevel | null) {
  const key = `${RESTAURANT_KILL_PREFIX}${restaurantId}`;
  if (level) {
    const updatedAt = Date.now();
    await db
      .insert(platformSettings)
      .values({ key, value: level, updatedAt })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: level, updatedAt } });
  } else {
    await db.delete(platformSettings).where(eq(platformSettings.key, key));
  }
  const base = cached?.state ?? EMPTY;
  const restaurants = { ...base.restaurants };
  if (level) restaurants[restaurantId] = level;
  else delete restaurants[restaurantId];
  cached = { state: { ...base, restaurants }, at: Date.now() };
}

/** The per-business status shown in the dashboard and Super Admin (uncached). */
export async function listRestaurantKillLevels(): Promise<Record<string, KillLevel>> {
  return (await readState()).restaurants;
}
