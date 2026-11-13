import "server-only";
import { desc, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { siteCoupons, sitePayments, siteProjects } from "@/db/schema";
import { getPlainSetting, secretSettingStatus, SETTING_GEMINI_KEY, SETTING_GEMINI_MODEL, SETTING_SITE_ENGINE, SETTING_SITE_PROMPT, SETTING_STRIPE_KEY, SETTING_STRIPE_WEBHOOK, getAnthropicKeyStatus } from "@/lib/platform-settings";
import { DEFAULT_GEMINI_MODEL } from "./generate";

// Everything the Super Admin → Website builder page shows. Returns null for the data parts if the
// site_* tables don't exist yet (their SQL not run), so the page shows a notice instead of erroring.
export async function getBuilderOverview() {
  const [gemini, stripeKey, stripeHook, model, engine, prompt, claude] = await Promise.all([
    secretSettingStatus(SETTING_GEMINI_KEY),
    secretSettingStatus(SETTING_STRIPE_KEY),
    secretSettingStatus(SETTING_STRIPE_WEBHOOK),
    getPlainSetting(SETTING_GEMINI_MODEL),
    getPlainSetting(SETTING_SITE_ENGINE),
    getPlainSetting(SETTING_SITE_PROMPT),
    getAnthropicKeyStatus().catch(() => ({ configured: false, last4: null, updatedAt: null })),
  ]);
  let data: {
    coupons: (typeof siteCoupons.$inferSelect)[];
    projects: (typeof siteProjects.$inferSelect & { paidPence: number })[];
    revenuePence: number;
  } | null = null;
  try {
    const [coupons, projects, paid] = await Promise.all([
      db.select().from(siteCoupons).orderBy(desc(siteCoupons.createdAt)),
      db.select().from(siteProjects).orderBy(desc(siteProjects.createdAt)).limit(100),
      db
        .select({ projectId: sitePayments.projectId, total: sql<number>`sum(${sitePayments.amountPence})` })
        .from(sitePayments)
        .where(inArray(sitePayments.status, ["paid", "consumed"]))
        .groupBy(sitePayments.projectId),
    ]);
    const byProject = new Map(paid.map((p) => [p.projectId, Number(p.total) || 0]));
    data = {
      coupons,
      projects: projects.map((p) => ({ ...p, paidPence: byProject.get(p.id) ?? 0 })),
      revenuePence: paid.reduce((s, p) => s + (Number(p.total) || 0), 0),
    };
  } catch (error) {
    console.error("[site-builder] overview failed", error);
  }
  return {
    gemini,
    stripeKey,
    stripeHook,
    claudeConfigured: claude.configured,
    model: model || DEFAULT_GEMINI_MODEL,
    engine: engine === "gemini" || engine === "claude" ? engine : "auto",
    prompt: prompt ?? "",
    now: Date.now(), // for "expired?" checks in the UI (a client component can't call Date.now while rendering)
    data,
  };
}
