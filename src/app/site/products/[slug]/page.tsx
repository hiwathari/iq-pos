import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getProduct, PRODUCTS } from "@/lib/site/products";
import { StatusBadge } from "../../_components/product-icon";
import { getSiteBase, POS_URL } from "../../_components/site-base";
import { CheckList, ConceptVisual, Eyebrow, GridBackdrop, LoyaltyVisual, PhoneFrame, ProductCard, ScreenFrame, SiteBuildVisual } from "../../_components/sections";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps<"/site/products/[slug]">): Promise<Metadata> {
  const product = getProduct((await params).slug);
  if (!product) return {};
  return { title: `${product.name} — ${product.tagline}`, description: product.intro };
}

export default async function ProductPage({ params }: PageProps<"/site/products/[slug]">) {
  const product = getProduct((await params).slug);
  if (!product) notFound();
  const base = await getSiteBase();

  const screens = product.shots.filter((s) => !s.phone);
  const phones = product.shots.filter((s) => s.phone);
  const others = PRODUCTS.filter((p) => p.slug !== product.slug).slice(0, 4);
  const soon = product.status === "soon";

  return (
    <>
      <section className="relative overflow-hidden pb-16 pt-36 sm:pt-44">
        <GridBackdrop />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <Eyebrow>{product.name}</Eyebrow>
              <StatusBadge status={product.status} />
            </div>
            <h1 className="mt-6 font-display text-5xl font-extrabold leading-[1.03] tracking-[-0.02em] sm:text-6xl">{product.headline}</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/60">{product.intro}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href={product.slug === "ai-website" ? `${base}/build` : `${base}/build?want=${product.slug}`}
                className="inline-flex items-center gap-2 rounded-full bg-teal-400 px-6 py-3.5 font-semibold text-[#04201F] shadow-[0_0_40px_-8px_rgba(45,212,191,0.9)] hover:bg-teal-300"
              >
                {soon ? "Join the waitlist" : product.slug === "ai-website" ? "Start my brief" : "Get started"} <ArrowRight className="h-4 w-4" />
              </Link>
              {product.status === "live" && (
                <a href={`${POS_URL}/login`} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3.5 font-semibold text-white hover:border-white/30">
                  Sign in to IQ POS
                </a>
              )}
            </div>
          </div>
          <div>
            {product.slug === "ai-website" ? (
              <SiteBuildVisual />
            ) : product.slug === "loyalty" ? (
              <LoyaltyVisual />
            ) : phones.length > 0 ? (
              <div className="flex items-end justify-center gap-5">
                {phones.map((s, i) => (
                  <PhoneFrame key={s.src} src={s.src} alt={s.alt} className={i > 0 ? "mb-10 hidden sm:block" : ""} />
                ))}
              </div>
            ) : screens.length > 0 ? (
              <ScreenFrame src={screens[0].src} alt={screens[0].alt} priority />
            ) : (
              <ConceptVisual product={product} />
            )}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{soon ? "What it will do" : "What you get"}</h2>
          <CheckList points={product.points} />
        </div>
      </section>

      {screens.length > (phones.length > 0 ? 0 : 1) && (
        <section className="py-16">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 sm:px-8 lg:grid-cols-2">
            {screens.slice(phones.length > 0 ? 0 : 1).map((s) => (
              <figure key={s.src}>
                <ScreenFrame src={s.src} alt={s.alt} />
                <figcaption className="mt-4 text-sm text-white/45">{s.alt}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <h2 className="font-display text-3xl font-extrabold tracking-tight">Works with the rest of IQ</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {others.map((p) => (
              <ProductCard key={p.slug} product={p} base={base} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
