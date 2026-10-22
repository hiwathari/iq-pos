import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import type { Product } from "@/lib/site/products";
import { ProductIcon, StatusBadge } from "./product-icon";

// Building blocks shared by the home page and the /products/<slug> pages.

export function GridBackdrop({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_50%_30%,black_30%,transparent_75%)]" />
      <div className="site-motion absolute left-1/2 top-[-10%] h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(20,189,189,0.28),rgba(20,189,189,0.06)_60%,transparent)] blur-2xl [animation:site-drift_16s_ease-in-out_infinite]" />
      <div className="site-motion absolute right-[-10%] top-[20%] h-[420px] w-[520px] rounded-full bg-[radial-gradient(closest-side,rgba(110,231,183,0.12),transparent)] blur-2xl [animation:site-drift_22s_ease-in-out_infinite_reverse]" />
    </div>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-teal-300/20 bg-teal-300/[0.07] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">
      {children}
    </span>
  );
}

export function GlowText({ children }: { children: React.ReactNode }) {
  return <span className="bg-gradient-to-r from-teal-200 via-teal-300 to-emerald-200 bg-clip-text text-transparent">{children}</span>;
}

export function ScreenFrame({ src, alt, priority = false, className = "" }: { src: string; alt: string; priority?: boolean; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <div aria-hidden className="absolute -inset-6 rounded-[36px] bg-teal-400/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0F141B] p-1.5 shadow-2xl shadow-black/60">
        <div className="flex items-center gap-1.5 px-3 pb-2 pt-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </div>
        <Image src={src} alt={alt} width={1600} height={1000} priority={priority} sizes="(min-width: 1024px) 720px, 100vw" className="block h-auto w-full rounded-xl" />
      </div>
    </div>
  );
}

export function PhoneFrame({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`relative w-[220px] shrink-0 sm:w-[250px] ${className}`}>
      <div aria-hidden className="absolute -inset-4 rounded-[48px] bg-teal-400/10 blur-2xl" />
      <div className="relative overflow-hidden rounded-[38px] border-[7px] border-[#1A2029] bg-black shadow-2xl shadow-black/70">
        <Image src={src} alt={alt} width={780} height={1688} sizes="250px" className="block h-auto w-full" />
      </div>
    </div>
  );
}

export function CheckList({ points }: { points: Product["points"] }) {
  return (
    <ul className="mt-7 grid gap-4 sm:grid-cols-2">
      {points.map((p) => (
        <li key={p.title} className="flex gap-3">
          <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${p.soon ? "bg-white/5 text-white/40" : "bg-teal-400/15 text-teal-300"}`}>
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </span>
          <span>
            <span className="flex flex-wrap items-center gap-2 font-semibold text-white">
              {p.title}
              {p.soon && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/45">Soon</span>}
            </span>
            <span className="mt-0.5 block text-[15px] leading-relaxed text-white/55">{p.body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ProductCard({ product, base }: { product: Product; base: string }) {
  return (
    <Link
      href={`${base}/products/${product.slug}`}
      className="group relative flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition hover:border-teal-300/25 hover:bg-white/[0.04]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400/20 to-teal-400/[0.03] text-teal-200 ring-1 ring-teal-300/15">
          <ProductIcon name={product.icon} className="h-5 w-5" />
        </span>
        <StatusBadge status={product.status} />
      </div>
      <div className="mt-5 font-display text-xl font-bold text-white">{product.name}</div>
      <div className="mt-1 text-sm text-white/50">{product.tagline}</div>
      <p className="mt-3 text-[15px] leading-relaxed text-white/60">{product.intro.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? product.intro}</p>
      <span className="mt-auto flex items-center gap-1.5 pt-5 text-sm font-semibold text-teal-300">
        {product.status === "soon" ? "Join the waitlist" : "See how it works"}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

// A stand-in for screens that don't exist yet (coming-soon products, the AI website) — drawn
// in CSS rather than faked as a screenshot.
export function ConceptVisual({ product }: { product: Product }) {
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-6 rounded-[36px] bg-teal-400/10 blur-3xl" />
      <div className="relative flex aspect-[16/11] flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[radial-gradient(ellipse_at_top,rgba(20,189,189,0.18),transparent_60%),#0D1117] p-8 text-center">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
        <span className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-teal-300/30 to-teal-500/5 text-teal-100 shadow-[0_0_60px_-10px_rgba(45,212,191,0.8)] ring-1 ring-teal-200/30">
          <ProductIcon name={product.icon} className="h-9 w-9" />
        </span>
        <div className="relative mt-6 font-display text-2xl font-bold text-white">{product.name}</div>
        <div className="relative mt-1 text-white/50">{product.tagline}</div>
        <StatusBadge status={product.status} className="relative mt-4" />
      </div>
    </div>
  );
}

// The AI Website section's visual: a browser window "being written" from a brief.
export function SiteBuildVisual() {
  return (
    <div className="relative">
      <div aria-hidden className="absolute -inset-6 rounded-[36px] bg-teal-400/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0F141B] shadow-2xl shadow-black/60">
        <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="ml-3 flex-1 truncate rounded-md bg-white/5 px-3 py-1 text-xs text-white/45">spicelane.co.uk</span>
        </div>
        <div className="grid gap-0 sm:grid-cols-[1fr_200px]">
          <div className="relative p-6">
            <div className="rounded-xl bg-gradient-to-br from-[#2E5E3E] to-[#16301F] p-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#E9D48B]">Indian & Nepalese · Leeds</div>
              <div className="mt-2 font-display text-3xl font-extrabold leading-tight text-white">Spice Lane</div>
              <div className="mt-2 max-w-xs text-sm text-white/75">Family recipes, slow-cooked curries and momos made by hand every morning.</div>
              <div className="mt-4 flex gap-2">
                <span className="rounded-full bg-[#C9A227] px-3 py-1.5 text-xs font-bold text-[#1A1405]">Order online</span>
                <span className="rounded-full border border-white/30 px-3 py-1.5 text-xs font-semibold text-white">Book a table</span>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {["Onion Bhaji · £4.50", "Chicken Momo · £6.95", "Rogan Josh · £12.50"].map((d) => (
                <div key={d} className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5 text-[11px] text-white/65">
                  <div className="mb-2 h-10 rounded-md bg-white/[0.06]" />
                  {d}
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-white/5 bg-white/[0.02] p-5 text-xs sm:border-l sm:border-t-0">
            <div className="font-semibold uppercase tracking-[0.16em] text-white/40">Found for you</div>
            {[
              ["Name", "Spice Lane"],
              ["Phone", "0113 496 0123"],
              ["Hours", "Mon–Thu 5–10pm"],
              ["Menu", "38 dishes"],
            ].map(([k, v]) => (
              <div key={k} className="mt-3">
                <div className="text-white/40">{k}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-white/85">
                  <Check className="h-3 w-3 text-teal-300" strokeWidth={3} /> {v}
                </div>
              </div>
            ))}
            <div className="mt-3 text-white/40">Colours</div>
            <div className="mt-1.5 flex gap-1.5">
              <span className="h-5 w-5 rounded-full bg-[#2E5E3E] ring-1 ring-white/20" />
              <span className="h-5 w-5 rounded-full bg-[#C9A227] ring-1 ring-white/20" />
              <span className="h-5 w-5 rounded-full bg-[#F5EFE0] ring-1 ring-white/20" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Loyalty's visual: the member card a guest keeps on their phone, drawn in CSS.
export function LoyaltyVisual() {
  const qr = [1, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 1, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1];
  return (
    <div className="relative flex justify-center">
      <div aria-hidden className="absolute -inset-6 rounded-[36px] bg-teal-400/10 blur-3xl" />
      <div className="relative w-full max-w-sm rotate-[-3deg] rounded-[28px] bg-gradient-to-br from-[#C2410C] via-[#9A3412] to-[#431407] p-6 text-white shadow-2xl shadow-black/60 ring-1 ring-white/10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Loyalty card</div>
            <div className="mt-1 font-display text-2xl font-extrabold">Demo Café</div>
          </div>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">12 visits</span>
        </div>
        <div className="mt-6 flex items-end justify-between gap-4">
          <div>
            <div className="text-xs text-white/60">Member</div>
            <div className="font-semibold">Taylor</div>
            <div className="mt-3 font-mono text-sm tracking-widest text-white/80">DEMO-4F7K</div>
          </div>
          <div className="grid grid-cols-8 gap-[3px] rounded-xl bg-white p-2.5">
            {qr.map((on, i) => (
              <span key={i} className={`h-2.5 w-2.5 rounded-[2px] ${on ? "bg-[#14172A]" : "bg-white"}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -bottom-6 right-4 rotate-[4deg] rounded-2xl border border-white/10 bg-[#0F141B] px-4 py-3 text-sm shadow-xl sm:right-10">
        <div className="text-white/45">Till · Discounts &amp; Loyalty</div>
        <div className="mt-1 font-semibold text-white">Taylor found · 10% applied</div>
      </div>
    </div>
  );
}
