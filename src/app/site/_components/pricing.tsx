"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { formatPlanPrice, PLANS, type Billing } from "@/lib/site/pricing";

// The three IQ POS plans with a Monthly / Annually switch — on the home page (#pricing) and the
// /pricing page. Each button opens the /build brief with the plan and billing pre-selected.
export function PricingPlans({ base }: { base: string }) {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
          {(["monthly", "annual"] as const).map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={billing === b}
              onClick={() => setBilling(b)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                billing === b ? "bg-teal-400 text-[#04201F] shadow-[0_0_24px_-6px_rgba(45,212,191,0.8)]" : "text-white/60 hover:text-white"
              }`}
            >
              {b === "monthly" ? "Monthly" : "Annually"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-12 grid items-stretch gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const price = billing === "annual" ? plan.annual : plan.monthly;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-3xl border p-7 ${
                plan.popular
                  ? "border-teal-300/40 bg-gradient-to-b from-teal-400/[0.10] to-white/[0.02] shadow-[0_0_60px_-20px_rgba(45,212,191,0.6)]"
                  : "border-white/[0.08] bg-white/[0.02]"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-7 rounded-full bg-teal-400 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#04201F]">
                  Most popular
                </span>
              )}
              <div className="font-display text-2xl font-extrabold text-white">{plan.name}</div>
              <p className="mt-1 text-[15px] text-white/55">{plan.tagline}</p>
              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="font-display text-5xl font-extrabold tracking-tight text-white">{formatPlanPrice(price)}</span>
                <span className="text-white/55">/ {billing === "annual" ? "year" : "month"}</span>
              </div>
              <div className="mt-1 text-sm text-white/40">Excluding VAT</div>
              <ul className="mb-8 mt-7 flex flex-col gap-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-3 text-[15px] text-white/75">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-400/15 text-teal-300">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={`${base}/build?plan=${plan.id}&billing=${billing}`}
                className={`mt-auto flex items-center justify-center gap-2 rounded-full px-5 py-3.5 font-semibold transition ${
                  plan.popular ? "bg-teal-400 text-[#04201F] hover:bg-teal-300" : "border border-white/15 text-white hover:border-white/30 hover:bg-white/[0.04]"
                }`}
              >
                {plan.cta} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}
