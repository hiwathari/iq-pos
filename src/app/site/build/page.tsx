import type { Metadata } from "next";
import { PRODUCTS } from "@/lib/site/products";
import { GridBackdrop } from "../_components/sections";
import { getSiteBase } from "../_components/site-base";
import { BuildClient } from "./build-client";

export const metadata: Metadata = {
  title: "Build my website",
  description: "Describe your restaurant, attach your logo and menu, and IQ fills in your website brief for you.",
};

export default async function BuildPage({ searchParams }: PageProps<"/site/build">) {
  const base = await getSiteBase();
  const want = (await searchParams).want;
  const wanted = (Array.isArray(want) ? want : want ? [want] : []).filter((slug) => PRODUCTS.some((p) => p.slug === slug));
  return (
    <section className="relative min-h-[80vh] overflow-hidden pb-24 pt-32 sm:pt-40">
      <GridBackdrop className="opacity-70" />
      <div className="relative mx-auto max-w-4xl px-4 sm:px-8">
        <BuildClient base={base} blobEnabled={!!process.env.BLOB_READ_WRITE_TOKEN} initialFeatures={wanted} />
      </div>
    </section>
  );
}
