"use server";

import { and, eq, gt } from "drizzle-orm";
import { getPlan, parseBilling } from "@/lib/site/pricing";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { websiteRequests } from "@/db/schema";
import { getAnthropicApiKey, saveAnthropicApiKey } from "@/lib/platform-settings";
import { requireSession } from "@/lib/scope";
import { EMPTY_BRIEF, isBlobUrl, MAX_DESCRIPTION, type BriefFields, type BriefFile } from "@/lib/site/brief";
import { testAnthropicKey } from "@/lib/site/extract-ai";
import { clientIpHash } from "@/lib/site/rate-limit";

export interface WebsiteBriefAnswers {
  style: string;
  pages: string[];
  domainChoice: "have" | "need" | "later";
  domain: string;
  timeline: string;
  usesIqPos: "yes" | "no" | "interested";
  notes: string;
  // The IQ POS plan picked on the Pricing page (lib/site/pricing.ts), if they came from there.
  plan?: string;
  billing?: string;
}

export interface WebsiteBriefPayload {
  description: string;
  fields: BriefFields;
  extractedWith: "basic" | "ai";
  files: BriefFile[];
  contact: { name: string; email: string; phone: string };
  answers: WebsiteBriefAnswers;
}

const SUBMIT_LIMIT_PER_HOUR = 5;

function str(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function strList(value: unknown, maxItems: number, maxLen: number) {
  return Array.isArray(value) ? value.map((v) => str(v, maxLen)).filter(Boolean).slice(0, maxItems) : [];
}

// Public — called from the /build page on iq.luvder.com with no session. Every field is
// re-validated and trimmed here rather than trusted from the client.
export async function submitWebsiteRequestAction(payload: WebsiteBriefPayload): Promise<{ ok: true; ref: string } | { ok: false; error: string }> {
  const contactName = str(payload?.contact?.name, 120);
  const contactEmail = str(payload?.contact?.email, 200).toLowerCase();
  const contactPhone = str(payload?.contact?.phone, 40);
  const description = str(payload?.description, MAX_DESCRIPTION);
  const f = payload?.fields ?? EMPTY_BRIEF;
  const restaurantName = str(f.restaurantName, 120);

  if (!restaurantName) return { ok: false, error: "Add your restaurant's name." };
  if (!contactName) return { ok: false, error: "Add your name so we know who to talk to." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail)) return { ok: false, error: "That email address doesn't look right." };
  if (description.length < 10) return { ok: false, error: "The description is missing." };

  const ipHash = await clientIpHash();
  const recent = await db
    .select({ id: websiteRequests.id })
    .from(websiteRequests)
    .where(and(eq(websiteRequests.ipHash, ipHash), gt(websiteRequests.createdAt, Date.now() - 60 * 60 * 1000)));
  if (recent.length >= SUBMIT_LIMIT_PER_HOUR) return { ok: false, error: "We've already had a few briefs from you this hour — try again a little later." };

  const fields: BriefFields = {
    restaurantName,
    cuisine: str(f.cuisine, 120),
    address: str(f.address, 300),
    phone: str(f.phone, 40),
    email: str(f.email, 200),
    website: str(f.website, 200),
    instagram: str(f.instagram, 80),
    openingHours: str(f.openingHours, 600),
    about: str(f.about, 1500),
    colours: strList(f.colours, 6, 7).filter((c) => /^#[0-9a-f]{6}$/i.test(c)),
    menuItems: (Array.isArray(f.menuItems) ? f.menuItems : [])
      .slice(0, 300)
      .map((m) => ({ name: str(m?.name, 120), price: str(m?.price, 20), category: str(m?.category, 60) }))
      .filter((m) => m.name),
    features: strList(f.features, 12, 40),
  };
  const a = payload?.answers;
  const answers: WebsiteBriefAnswers = {
    style: str(a?.style, 60),
    pages: strList(a?.pages, 12, 40),
    domainChoice: a?.domainChoice === "have" || a?.domainChoice === "need" ? a.domainChoice : "later",
    domain: str(a?.domain, 120),
    timeline: str(a?.timeline, 60),
    usesIqPos: a?.usesIqPos === "yes" || a?.usesIqPos === "no" ? a.usesIqPos : "interested",
    notes: str(a?.notes, 2000),
    plan: getPlan(a?.plan)?.id ?? "",
    billing: getPlan(a?.plan) ? parseBilling(a?.billing) : "",
  };
  const files: BriefFile[] = (Array.isArray(payload?.files) ? payload.files : []).slice(0, 12).map((file) => ({
    kind: file?.kind === "logo" || file?.kind === "menu" ? file.kind : "photo",
    name: str(file?.name, 160),
    url: typeof file?.url === "string" && isBlobUrl(file.url) ? file.url : null,
    size: Number(file?.size) || 0,
  }));

  const [row] = await db
    .insert(websiteRequests)
    .values({
      restaurantName,
      contactName,
      contactEmail,
      contactPhone: contactPhone || null,
      description,
      details: { fields, answers },
      files,
      extractedWith: payload?.extractedWith === "ai" ? "ai" : "basic",
      ipHash,
    })
    .returning({ id: websiteRequests.id });

  revalidatePath("/super-admin/website-requests");
  return { ok: true, ref: row.id.slice(0, 8).toUpperCase() };
}

async function requireSuperAdmin() {
  const session = await requireSession();
  if (session.role !== "super_admin") throw new Error("Forbidden");
  return session;
}

export async function updateWebsiteRequestAction(id: string, patch: { status?: "new" | "in_progress" | "done" | "archived"; adminNotes?: string }) {
  await requireSuperAdmin();
  const set: Partial<typeof websiteRequests.$inferInsert> = { updatedAt: Date.now() };
  if (patch.status && ["new", "in_progress", "done", "archived"].includes(patch.status)) set.status = patch.status;
  if (typeof patch.adminNotes === "string") set.adminNotes = patch.adminNotes.slice(0, 4000);
  await db.update(websiteRequests).set(set).where(eq(websiteRequests.id, id));
  revalidatePath("/super-admin/website-requests");
}

export async function saveAiKeyAction(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const key = apiKey.trim();
  if (!/^sk-ant-[\w-]{20,}$/.test(key)) return { ok: false, error: "That doesn't look like an Anthropic API key (they start with sk-ant-)." };
  const test = await testAnthropicKey(key);
  if (!test.ok) return test;
  await saveAnthropicApiKey(key);
  revalidatePath("/super-admin/website-requests");
  return { ok: true };
}

export async function clearAiKeyAction() {
  await requireSuperAdmin();
  await saveAnthropicApiKey(null);
  revalidatePath("/super-admin/website-requests");
}

export async function testSavedAiKeyAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireSuperAdmin();
  const key = await getAnthropicApiKey();
  if (!key) return { ok: false, error: "No key saved." };
  return testAnthropicKey(key);
}
