import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stripeConfigured } from "@/lib/site/stripe";
import { confirmPaymentById, getProject, pendingCredit } from "@/lib/site/projects";
import { getSiteBase } from "../../_components/site-base";
import { StudioClient } from "./studio-client";

export const metadata: Metadata = { title: "Your website", robots: { index: false, follow: false } };
// The AI call runs inside a server action on this route — give it room.
export const maxDuration = 300;

export default async function StudioPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await params;
  const query = await searchParams;
  let project = await getProject(token);
  if (!project) notFound();

  // Back from Stripe: confirm with Stripe that the payment really went through before showing anything.
  const pay = typeof query.pay === "string" ? query.pay : null;
  let paymentChecked: boolean | null = null;
  if (pay) {
    try {
      paymentChecked = await confirmPaymentById(pay, project.id);
    } catch {
      paymentChecked = false;
    }
    project = (await getProject(token)) ?? project;
  }

  const credit = await pendingCredit(project.id);
  const base = await getSiteBase();
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 pt-28 sm:px-8 sm:pt-36">
      <StudioClient
        token={token}
        name={project.name}
        status={project.status}
        hasSite={!!project.html}
        credit={credit ? { kind: credit.kind, instruction: credit.instruction } : null}
        lastError={project.lastError}
        html={project.html ?? ""}
        css={project.css ?? ""}
        previewSrc={`${base}/preview/${token}?v=${project.updatedAt ?? 0}`}
        paymentsEnabled={await stripeConfigured()}
        paymentChecked={paymentChecked}
        cancelled={query.cancelled === "1"}
      />
    </section>
  );
}
