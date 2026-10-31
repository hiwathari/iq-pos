import Link from "next/link";
import { ArrowRight, FileText, ListChecks, Rocket } from "lucide-react";
import { getProduct, PRODUCTS } from "@/lib/site/products";
import { HeroPrompt } from "./_components/hero-prompt";
import { PricingPlans } from "./_components/pricing";
import { ProductIcon } from "./_components/product-icon";
import { getSiteBase } from "./_components/site-base";
import {
  CheckList,
  Eyebrow,
  GlobalPricingNote,
  GlowText,
  GridBackdrop,
  LoyaltyVisual,
  PhoneFrame,
  ProductCard,
  ScreenFrame,
  SiteBuildVisual,
} from "./_components/sections";

const STEPS = [
  {
    n: "01",
    title: "Describe.",
    body: "A few sentences about your place — what you cook, where you are, how it should feel. Attach your logo and menu if you have them.",
    icon: FileText,
  },
  {
    n: "02",
    title: "Review.",
    body: "IQ pulls out your name, address, hours, colours and dishes and fills in the brief. Fix anything it got wrong and answer a few quick questions.",
    icon: ListChecks,
  },
  {
    n: "03",
    title: "Go live.",
    body: "We build the site, put it on your domain and connect ordering, booking and loyalty to the same POS your team uses at the counter.",
    icon: Rocket,
  },
];

const QUICK_FAQ = [
  { q: "Do I need IQ POS to get a website?", a: "No. The website works on its own — but connected to IQ POS, your menu, prices and opening hours stay in sync automatically." },
  { q: "Can I use my own domain?", a: "Yes. Keep the domain you have, or start on a free IQ address and move to your own later." },
  { q: "What hardware does the POS need?", a: "Any touch screen with a browser — 11\" to 27\" counter screens, iPads, or a Sunmi terminal. Card machines and receipt printers plug in." },
  { q: "Which parts are ready today?", a: "The POS, table QR ordering, online ordering, the floor plan and loyalty cards are live. Anything marked “Coming soon” is on our roadmap — join the waitlist from its page." },
];

export default async function SiteHome() {
  const base = await getSiteBase();
  const pos = getProduct("pos")!;
  const customerApp = getProduct("customer-app")!;
  const booking = getProduct("table-booking")!;
  const loyalty = getProduct("loyalty")!;
  const aiWebsite = getProduct("ai-website")!;
  const soon = PRODUCTS.filter((p) => p.status === "soon");

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden pb-20 pt-36 sm:pt-44">
        <GridBackdrop />
        <div className="relative mx-auto max-w-7xl px-5 text-center sm:px-8">
          <div className="[animation:site-rise_.7s_ease-out_both]">
            <Eyebrow>AI for independent restaurants</Eyebrow>
          </div>
          <h1 className="mx-auto mt-7 max-w-5xl font-display text-[44px] font-extrabold leading-[1.02] tracking-[-0.02em] text-white [animation:site-rise_.8s_ease-out_.05s_both] sm:text-7xl lg:text-[86px]">
            Tell us about your restaurant. <GlowText>We&apos;ll build the rest.</GlowText>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/60 [animation:site-rise_.8s_ease-out_.1s_both] sm:text-xl">
            Describe your place in a few sentences and IQ turns it into a website — connected to a POS, table ordering and loyalty that already run real restaurants.
          </p>
          <div className="mt-10 [animation:site-rise_.8s_ease-out_.15s_both]">
            <HeroPrompt base={base} />
          </div>
          <div className="mx-auto mt-7 flex max-w-4xl flex-wrap justify-center gap-2">
            {PRODUCTS.map((p) => (
              <Link
                key={p.slug}
                href={`${base}/products/${p.slug}`}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition ${
                  p.status === "soon" ? "border-white/5 text-white/40 hover:text-white/70" : "border-white/10 bg-white/[0.03] text-white/75 hover:border-teal-300/30 hover:text-white"
                }`}
              >
                <ProductIcon name={p.icon} className="h-3.5 w-3.5" />
                {p.name}
                {p.status === "soon" && <span className="text-[10px] uppercase tracking-wide text-white/30">soon</span>}
              </Link>
            ))}
          </div>
        </div>

        <div className="relative mx-auto mt-20 max-w-6xl px-5 sm:px-8">
          <ScreenFrame src="/site/shots/till.webp" alt="The IQ Till: menu on the left, the order and payment on the right" priority />
        </div>
      </section>

      {/* Statement */}
      <section className="relative overflow-hidden py-28">
        <div aria-hidden className="absolute left-1/2 top-1/2 h-[380px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(20,189,189,0.18),transparent)] blur-2xl" />
        <div className="relative mx-auto max-w-5xl px-5 text-center sm:px-8">
          <p className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-white/90 [text-shadow:0_0_40px_rgba(94,234,212,0.25)] sm:text-6xl">
            One system for the whole restaurant — from the first search on Google to the last receipt of the night.
          </p>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-white/50">
            Website, guest ordering, tables, loyalty and the till share one menu and one set of numbers. Change a price once and it&apos;s right everywhere.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-28 py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="text-center">
            <Eyebrow>How it works</Eyebrow>
            <h2 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">From a few sentences to a live site.</h2>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-transparent p-7">
                <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-teal-400/10 blur-2xl" />
                <div className="font-mono text-sm text-teal-300">{s.n}</div>
                <div className="mt-6 flex items-center gap-3">
                  <s.icon className="h-6 w-6 text-teal-200" />
                  <div className="font-display text-3xl font-extrabold">{s.title}</div>
                </div>
                <p className="mt-4 leading-relaxed text-white/55">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Website */}
      <FeatureRow base={base} product={aiWebsite} eyebrow="AI Website · Early access" visual={<SiteBuildVisual />} cta={{ href: `${base}/build`, label: "Start my brief" }} />

      {/* POS */}
      <FeatureRow base={base} product={pos} eyebrow="POS" reverse visual={<ScreenFrame src={pos.shots[1].src} alt={pos.shots[1].alt} />} />

      {/* Customer app */}
      <FeatureRow
        base={base}
        product={customerApp}
        eyebrow="Customer App"
        visual={
          <div className="flex items-end justify-center gap-4 sm:gap-6">
            <PhoneFrame src={customerApp.shots[0].src} alt={customerApp.shots[0].alt} />
            <PhoneFrame src={customerApp.shots[1].src} alt={customerApp.shots[1].alt} className="mb-10 hidden sm:block" />
          </div>
        }
      />

      {/* Table booking */}
      <FeatureRow base={base} product={booking} eyebrow="Table Booking" reverse visual={<ScreenFrame src={booking.shots[0].src} alt={booking.shots[0].alt} />} />

      {/* Loyalty */}
      <FeatureRow base={base} product={loyalty} eyebrow="Loyalty" visual={<LoyaltyVisual />} />

      {/* Everything */}
      <section className="py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
            <div>
              <Eyebrow>On the way</Eyebrow>
              <h2 className="mt-5 max-w-2xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">More ways to grow, landing soon.</h2>
            </div>
            <p className="max-w-md text-white/55">Tell us which ones you want first — we build in the order restaurants ask for them.</p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {soon.map((p) => (
              <ProductCard key={p.slug} product={p} base={base} />
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="scroll-mt-28 py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Simple plans for every size.</h2>
            <p className="mx-auto mt-4 max-w-xl text-white/55">Pay monthly or once a year.</p>
          </div>
          <div className="mt-10">
            <PricingPlans base={base} />
          </div>
          <GlobalPricingNote />
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <Eyebrow>Questions</Eyebrow>
            <h2 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">The short answers.</h2>
            <p className="mt-4 text-white/55">Step-by-step guides with screenshots for every part of the POS live in the FAQ.</p>
            <Link href="/faq" className="mt-7 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-3 font-semibold text-white hover:border-white/30">
              Read the full FAQ <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-white/[0.07] rounded-3xl border border-white/[0.07] bg-white/[0.02]">
            {QUICK_FAQ.map((f) => (
              <details key={f.q} className="group p-6 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-white">
                  {f.q}
                  <span className="text-xl text-teal-300 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 leading-relaxed text-white/60">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden py-28">
        <GridBackdrop />
        <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
          <h2 className="font-display text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-7xl">
            Your restaurant, <GlowText>online this week.</GlowText>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/55">Start with a few sentences. It takes about three minutes, and there&apos;s nothing to pay to begin.</p>
          <Link
            href={`${base}/build`}
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-teal-400 px-7 py-4 text-lg font-semibold text-[#04201F] shadow-[0_0_50px_-8px_rgba(45,212,191,0.9)] hover:bg-teal-300"
          >
            Build my website <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </>
  );
}

function FeatureRow({
  base,
  product,
  eyebrow,
  visual,
  reverse = false,
  cta,
}: {
  base: string;
  product: NonNullable<ReturnType<typeof getProduct>>;
  eyebrow: string;
  visual: React.ReactNode;
  reverse?: boolean;
  cta?: { href: string; label: string };
}) {
  return (
    <section className="py-20">
      <div className={`mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2 ${reverse ? "lg:[&>*:first-child]:order-2" : ""}`}>
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <h2 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">{product.headline}</h2>
          <p className="mt-5 text-lg leading-relaxed text-white/60">{product.intro}</p>
          <CheckList points={product.points.slice(0, 4)} />
          <Link
            href={cta?.href ?? `${base}/products/${product.slug}`}
            className="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 font-semibold text-[#07090D] hover:bg-white/90"
          >
            {cta?.label ?? `More about ${product.name}`} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div>{visual}</div>
      </div>
    </section>
  );
}
