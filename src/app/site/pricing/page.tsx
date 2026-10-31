import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PricingPlans } from "../_components/pricing";
import { Eyebrow, GlobalPricingNote, GlowText, GridBackdrop } from "../_components/sections";
import { getSiteBase } from "../_components/site-base";

export const metadata: Metadata = {
  title: "Pricing",
  description: "IQ POS plans for cafés, restaurants and multi-site businesses — Basic, Standard and Premium, monthly or annually.",
};

export default async function PricingPage() {
  const base = await getSiteBase();
  return (
    <>
      <section className="relative overflow-hidden pb-24 pt-36 sm:pt-44">
        <GridBackdrop />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
          <div className="text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h1 className="mx-auto mt-6 max-w-4xl font-display text-5xl font-extrabold leading-[1.04] tracking-tight text-white sm:text-7xl">
              Simple plans. <GlowText>Pick the one that fits.</GlowText>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-white/60">Pay monthly or once a year. Every plan runs on the same IQ POS your team uses at the counter.</p>
          </div>
          <div className="mt-12">
            <PricingPlans base={base} />
          </div>
          <GlobalPricingNote />
        </div>
      </section>

      <section className="pb-24">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Not sure which plan?</h2>
          <p className="mt-4 text-white/55">Tell us about your place and we&apos;ll suggest the right setup — tills, kitchen screens and card machines included.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href={`${base}/build`} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-[#07090D] hover:bg-white/90">
              Describe my restaurant <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/faq" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-semibold text-white hover:border-white/30">
              Read the FAQ
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
