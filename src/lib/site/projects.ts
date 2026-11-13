import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, ne, or, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { sitePayments, siteProjects } from "@/db/schema";
import { listPence, priceAfterCoupon, type PurchaseKind } from "./builder-pricing";
import { checkCoupon, redeemCoupon } from "./coupons";
import { generateSite, reviseSite } from "./generate";
import { cleanCss, cleanHtml, withFontImports } from "./sanitize";
import { briefToSiteData, sanitiseDesign, type SiteDetails } from "./site-data";
import { render, type Design } from "./templates";
import { createCheckoutSession, retrieveCheckoutSession, stripeConfigured } from "./stripe";

export type SiteProject = typeof siteProjects.$inferSelect;
export type SitePayment = typeof sitePayments.$inferSelect;

// A "generating" project older than this is assumed to have died mid-run (e.g. the function timed out).
const STALE_GENERATING_MS = 6 * 60 * 1000;

export async function createProject(input: { requestId: string | null; name: string; contactEmail: string; brief: Record<string, unknown> }): Promise<string> {
  const token = randomBytes(18).toString("base64url");
  await db.insert(siteProjects).values({ token, requestId: input.requestId, name: input.name, contactEmail: input.contactEmail, brief: input.brief });
  return token;
}

export async function getProject(token: string): Promise<SiteProject | null> {
  if (!/^[\w-]{20,40}$/.test(token)) return null;
  const [row] = await db.select().from(siteProjects).where(eq(siteProjects.token, token)).limit(1);
  return row ?? null;
}

export async function listPayments(projectId: string): Promise<SitePayment[]> {
  return db.select().from(sitePayments).where(eq(sitePayments.projectId, projectId)).orderBy(asc(sitePayments.createdAt));
}

/** Paid but not yet used — the build, or a change request, still waiting to run. */
export async function pendingCredit(projectId: string): Promise<SitePayment | null> {
  const [row] = await db
    .select()
    .from(sitePayments)
    .where(and(eq(sitePayments.projectId, projectId), eq(sitePayments.status, "paid")))
    .orderBy(asc(sitePayments.createdAt))
    .limit(1);
  return row ?? null;
}

export async function markPaid(paymentId: string): Promise<SitePayment | null> {
  const [row] = await db
    .update(sitePayments)
    .set({ status: "paid", paidAt: Date.now() })
    .where(and(eq(sitePayments.id, paymentId), eq(sitePayments.status, "pending")))
    .returning();
  if (!row) return null; // already paid / used — nothing more to do (idempotent)
  if (row.couponId) await redeemCoupon(row.couponId, row.id, row.projectId);
  await db.update(siteProjects).set({ status: "paid", updatedAt: Date.now() }).where(and(eq(siteProjects.id, row.projectId), eq(siteProjects.status, "awaiting_payment")));
  return row;
}

export type PurchaseResult =
  | { ok: true; kind: "redirect"; url: string }
  | { ok: true; kind: "paid" } // free (100% coupon) or a credit that was already paid
  | { ok: false; error: string };

export async function beginPurchase(
  project: SiteProject,
  kind: PurchaseKind,
  opts: { instruction?: string; couponCode?: string; successUrl: string; cancelUrl: string }
): Promise<PurchaseResult> {
  if (project.status === "generating") return { ok: false, error: "Your site is being written right now — give it a minute." };
  if (kind === "build") {
    if (project.html) return { ok: false, error: "Your site is already built." };
  } else {
    if (!project.html) return { ok: false, error: "Build your site first." };
    if (!opts.instruction || opts.instruction.trim().length < 5) return { ok: false, error: "Describe the change you'd like." };
  }
  // Something already paid for is waiting to run — never charge twice for it.
  if (await pendingCredit(project.id)) return { ok: true, kind: "paid" };

  const list = listPence(kind);
  let coupon = null;
  if (opts.couponCode?.trim()) {
    const checked = await checkCoupon(opts.couponCode, kind);
    if (!checked.ok) return { ok: false, error: checked.error };
    coupon = checked.coupon;
  }
  const amount = priceAfterCoupon(list, coupon);

  const [payment] = await db
    .insert(sitePayments)
    .values({
      projectId: project.id,
      kind,
      instruction: kind === "change" ? opts.instruction!.trim().slice(0, 1500) : null,
      listPence: list,
      amountPence: amount,
      couponId: coupon?.id ?? null,
      couponCode: coupon?.code ?? null,
    })
    .returning();

  if (amount === 0) {
    await markPaid(payment.id);
    return { ok: true, kind: "paid" };
  }
  // Stripe won't take less than 30p; a coupon that leaves a tiny balance is rounded up by the customer paying 30p.
  const charge = Math.max(30, amount);
  if (!(await stripeConfigured())) {
    await db.delete(sitePayments).where(eq(sitePayments.id, payment.id));
    return { ok: false, error: "Payments aren't switched on yet — please contact us." };
  }
  try {
    const session = await createCheckoutSession({
      paymentId: payment.id,
      projectId: project.id,
      title: kind === "build" ? `Website for ${project.name}` : `Website change for ${project.name}`,
      amountPence: charge,
      customerEmail: project.contactEmail,
      successUrl: opts.successUrl.replace("{PAYMENT}", payment.id),
      cancelUrl: opts.cancelUrl,
    });
    await db.update(sitePayments).set({ stripeSessionId: session.id, amountPence: charge }).where(eq(sitePayments.id, payment.id));
    if (!session.url) throw new Error("Stripe gave no checkout link.");
    return { ok: true, kind: "redirect", url: session.url };
  } catch (error) {
    await db.update(sitePayments).set({ status: "failed" }).where(eq(sitePayments.id, payment.id));
    console.error("[site-builder] checkout failed", error);
    return { ok: false, error: "Couldn't start the payment. Please try again." };
  }
}

/** Called when the customer returns from Stripe (or by the webhook): verifies with Stripe, then marks paid. */
export async function confirmPaymentById(paymentId: string, projectId: string): Promise<boolean> {
  const [payment] = await db.select().from(sitePayments).where(and(eq(sitePayments.id, paymentId), eq(sitePayments.projectId, projectId))).limit(1);
  if (!payment) return false;
  if (payment.status !== "pending") return payment.status === "paid" || payment.status === "consumed";
  if (!payment.stripeSessionId) return false;
  const session = await retrieveCheckoutSession(payment.stripeSessionId);
  if (session.payment_status !== "paid" || session.metadata?.payment_id !== payment.id) return false;
  await markPaid(payment.id);
  return true;
}

export async function recordWebhookPaid(sessionId: string, paymentId: string | undefined): Promise<void> {
  if (!paymentId) return;
  const [payment] = await db.select().from(sitePayments).where(eq(sitePayments.id, paymentId)).limit(1);
  if (!payment || payment.stripeSessionId !== sessionId) return;
  await markPaid(payment.id);
}

/**
 * Runs the oldest paid-but-unused job (the first build, or a change request) for this project. Safe to call
 * repeatedly: only one run goes at a time, and a payment is only consumed once the AI call succeeds — so a
 * failure can be retried without paying again.
 */
export async function runNextJob(token: string): Promise<{ ok: true; ran: boolean } | { ok: false; error: string }> {
  const project = await getProject(token);
  if (!project) return { ok: false, error: "Project not found." };
  const credit = await pendingCredit(project.id);
  if (!credit) return { ok: true, ran: false };

  // Claim the project (one run at a time; a run that died long ago can be taken over).
  const now = Date.now();
  const claimed = await db
    .update(siteProjects)
    .set({ status: "generating", lastError: null, updatedAt: now })
    .where(and(eq(siteProjects.id, project.id), or(ne(siteProjects.status, "generating"), lt(siteProjects.updatedAt, now - STALE_GENERATING_MS))))
    .returning({ id: siteProjects.id });
  if (claimed.length === 0) return { ok: true, ran: false };

  try {
    const brief = project.brief as Record<string, unknown>;
    const draft =
      credit.kind === "build" || !project.html
        ? await generateSite(brief)
        : await reviseSite(brief, { html: project.html, css: project.css ?? "" }, credit.instruction ?? "");
    await db
      .update(siteProjects)
      .set({ html: draft.html, css: draft.css, engine: draft.engine, status: "ready", generations: project.generations + 1, lastError: null, updatedAt: Date.now() })
      .where(eq(siteProjects.id, project.id));
    await db.update(sitePayments).set({ status: "consumed", consumedAt: Date.now() }).where(eq(sitePayments.id, credit.id));
    return { ok: true, ran: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    console.error("[site-builder] generation failed", error);
    await db
      .update(siteProjects)
      .set({ status: project.html ? "ready" : "failed", lastError: message.slice(0, 500), updatedAt: Date.now() })
      .where(eq(siteProjects.id, project.id));
    return { ok: false, error: message };
  }
}

/** Free manual edits from the visual editor. */
export async function saveManualEdit(token: string, html: string, css: string): Promise<boolean> {
  const project = await getProject(token);
  if (!project || !project.html || project.status === "generating") return false;
  const cleanedHtml = cleanHtml(html.slice(0, 400_000));
  if (cleanedHtml.length < 50) return false;
  const cleanedCss = withFontImports(cleanedHtml, cleanCss(css.slice(0, 400_000)));
  await db.update(siteProjects).set({ html: cleanedHtml, css: cleanedCss, updatedAt: Date.now() }).where(eq(siteProjects.id, project.id));
  return true;
}

const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Free: builds (or rebuilds) the site from one of the ready-made designs using the brief's data plus the
 * details/design the customer chose. No AI, no payment. Replaces the current page, hand edits included —
 * the studio asks the customer to confirm that first.
 */
export async function applyDesign(token: string, designInput: Partial<Design>, details: Partial<SiteDetails>): Promise<{ ok: true } | { ok: false; error: string }> {
  const project = await getProject(token);
  if (!project) return { ok: false, error: "We couldn't find your site." };
  if (project.status === "generating") return { ok: false, error: "Your site is being written right now — give it a minute." };
  if (await pendingCredit(project.id)) return { ok: false, error: "You have a paid build waiting — let it finish first." };

  const design = sanitiseDesign(designInput);
  const brief = { ...(project.brief as Record<string, unknown>) };
  const fields = { ...((brief.fields as Record<string, unknown>) ?? {}) };
  fields.restaurantName = t(details.name, 120) || fields.restaurantName || project.name;
  fields.tagline = t(details.tagline, 140);
  fields.cuisine = t(details.cuisine, 120);
  fields.about = t(details.about, 1500);
  fields.phone = t(details.phone, 40);
  fields.email = t(details.email, 200);
  fields.address = t(details.address, 300);
  fields.instagram = t(details.instagram, 80);
  fields.openingHours = t(details.hours, 700);
  fields.colours = [design.primary, design.accent];
  brief.fields = fields;
  brief.design = design;

  const { html, css } = render(briefToSiteData(brief), design);
  const cleanedHtml = cleanHtml(html);
  const cleanedCss = withFontImports(cleanedHtml, cleanCss(css));
  await db
    .update(siteProjects)
    .set({
      brief,
      name: String(fields.restaurantName).slice(0, 120),
      html: cleanedHtml,
      css: cleanedCss,
      engine: "template",
      status: "ready",
      generations: project.generations + 1,
      lastError: null,
      updatedAt: Date.now(),
    })
    .where(eq(siteProjects.id, project.id));
  return { ok: true };
}

export async function listProjects(limit = 200) {
  return db.select().from(siteProjects).orderBy(desc(siteProjects.createdAt)).limit(limit);
}
