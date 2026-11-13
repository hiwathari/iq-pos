"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { siteCoupons } from "@/db/schema";
import {
  getPlainSetting,
  getSecretSetting,
  savePlainSetting,
  saveSecretSetting,
  SETTING_GEMINI_KEY,
  SETTING_GEMINI_MODEL,
  SETTING_SITE_ENGINE,
  SETTING_SITE_PROMPT,
  SETTING_STRIPE_KEY,
  SETTING_STRIPE_WEBHOOK,
} from "@/lib/platform-settings";
import { requireSession } from "@/lib/scope";
import { DEFAULT_GEMINI_MODEL, testGeminiKey } from "@/lib/site/generate";
import { normaliseCode } from "@/lib/site/coupons";

type Result = { ok: true } | { ok: false; error: string };

async function requireSuperAdmin() {
  const session = await requireSession();
  if (session.role !== "super_admin") throw new Error("Forbidden");
  return session;
}

const done = () => revalidatePath("/super-admin/site-builder");

export async function saveGeminiKeyAction(apiKey: string, model: string): Promise<Result> {
  await requireSuperAdmin();
  const key = apiKey.trim();
  const modelName = model.trim() || DEFAULT_GEMINI_MODEL;
  if (key) {
    if (!/^[\w-]{20,}$/.test(key)) return { ok: false, error: "That doesn't look like a Google AI Studio key." };
    const test = await testGeminiKey(key, modelName);
    if (!test.ok) return test;
    await saveSecretSetting(SETTING_GEMINI_KEY, key);
  }
  await savePlainSetting(SETTING_GEMINI_MODEL, modelName === DEFAULT_GEMINI_MODEL ? null : modelName);
  done();
  return { ok: true };
}

export async function clearGeminiKeyAction() {
  await requireSuperAdmin();
  await saveSecretSetting(SETTING_GEMINI_KEY, null);
  done();
}

export async function testSavedGeminiKeyAction(): Promise<Result> {
  await requireSuperAdmin();
  const key = await getSecretSetting(SETTING_GEMINI_KEY);
  if (!key) return { ok: false, error: "No key saved." };
  return testGeminiKey(key, (await getPlainSetting(SETTING_GEMINI_MODEL)) || DEFAULT_GEMINI_MODEL);
}

export async function saveStripeAction(secretKey: string, webhookSecret: string): Promise<Result> {
  await requireSuperAdmin();
  const key = secretKey.trim();
  const hook = webhookSecret.trim();
  if (key && !/^(sk|rk)_(test|live)_[\w]{10,}$/.test(key)) return { ok: false, error: "That doesn't look like a Stripe secret key (it starts with sk_live_ or sk_test_)." };
  if (hook && !/^whsec_[\w]{10,}$/.test(hook)) return { ok: false, error: "A webhook signing secret starts with whsec_." };
  if (key) await saveSecretSetting(SETTING_STRIPE_KEY, key);
  if (hook) await saveSecretSetting(SETTING_STRIPE_WEBHOOK, hook);
  done();
  return { ok: true };
}

export async function clearStripeAction(which: "key" | "webhook") {
  await requireSuperAdmin();
  await saveSecretSetting(which === "key" ? SETTING_STRIPE_KEY : SETTING_STRIPE_WEBHOOK, null);
  done();
}

export async function saveBuilderPromptAction(engine: string, extraPrompt: string): Promise<Result> {
  await requireSuperAdmin();
  const e = engine === "gemini" || engine === "claude" ? engine : "auto";
  await savePlainSetting(SETTING_SITE_ENGINE, e === "auto" ? null : e);
  await savePlainSetting(SETTING_SITE_PROMPT, extraPrompt.trim().slice(0, 6000) || null);
  done();
  return { ok: true };
}

export interface CouponInput {
  code: string;
  kind: "percent" | "pence";
  value: number; // percent (1–100) or pounds
  appliesTo: "any" | "build" | "change";
  expiresAt: number | null; // ms since epoch
  maxUses: number | null;
  note: string;
}

export async function createCouponAction(input: CouponInput): Promise<Result> {
  await requireSuperAdmin();
  const code = normaliseCode(input.code);
  if (!/^[A-Z0-9_-]{3,30}$/.test(code)) return { ok: false, error: "Use 3–30 letters, numbers, - or _ for the code." };
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0) return { ok: false, error: "Enter how much the code takes off." };
  if (input.kind === "percent" && value > 100) return { ok: false, error: "A percentage can't be more than 100." };
  const maxUses = input.maxUses === null ? null : Math.floor(Number(input.maxUses));
  if (maxUses !== null && (!Number.isFinite(maxUses) || maxUses < 1)) return { ok: false, error: "The use limit must be at least 1 (or empty for unlimited)." };
  if (input.expiresAt !== null && (!Number.isFinite(input.expiresAt) || input.expiresAt <= Date.now())) return { ok: false, error: "The expiry has to be in the future." };
  const [existing] = await db.select({ id: siteCoupons.id }).from(siteCoupons).where(eq(siteCoupons.code, code)).limit(1);
  if (existing) return { ok: false, error: "That code already exists." };
  await db.insert(siteCoupons).values({
    code,
    percentOff: input.kind === "percent" ? Math.round(value) : null,
    penceOff: input.kind === "pence" ? Math.round(value * 100) : null,
    appliesTo: input.appliesTo === "build" || input.appliesTo === "change" ? input.appliesTo : "any",
    expiresAt: input.expiresAt,
    maxUses,
    note: input.note.trim().slice(0, 200) || null,
  });
  done();
  return { ok: true };
}

export async function setCouponActiveAction(id: string, active: boolean) {
  await requireSuperAdmin();
  await db.update(siteCoupons).set({ active }).where(eq(siteCoupons.id, id));
  done();
}

export async function deleteCouponAction(id: string) {
  await requireSuperAdmin();
  await db.delete(siteCoupons).where(eq(siteCoupons.id, id));
  done();
}
