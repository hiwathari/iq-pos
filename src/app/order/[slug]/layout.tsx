import type { Metadata } from "next";
import { headers } from "next/headers";
import { createHash } from "crypto";
import { getRestaurantBySlug } from "@/lib/data/restaurants";

// Every public ordering page for a restaurant (online order, kiosk, table QR) shares that
// restaurant's identity: its name as the title, its logo as the browser/home-screen icon, and its
// logo as the social-share image (WhatsApp, Facebook, iMessage, X). The image URLs must be
// absolute for share previews, so they're built from whichever host the page was requested on —
// the restaurant's own custom domain, pos.luvder.com and iq-pos.vercel.app all work.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return {};

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "pos.luvder.com";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");

  const v = createHash("sha1").update(restaurant.invoiceLogoUrl ?? "none").digest("hex").slice(0, 10);
  const image = (w: number, hh: number) => `/order/${restaurant.slug}/brand-image?w=${w}&h=${hh}&v=${v}`;
  const title = `${restaurant.name} · Order online`;
  const description = `See the ${restaurant.name} menu and order online.`;
  const share = { url: image(1200, 630), width: 1200, height: 630, alt: restaurant.name };

  return {
    metadataBase: new URL(`${proto}://${host}`),
    title,
    description,
    icons: { icon: image(64, 64), apple: image(180, 180) },
    openGraph: { type: "website", siteName: restaurant.name, title, description, images: [share] },
    twitter: { card: "summary_large_image", title, description, images: [share.url] },
  };
}

export default function RestaurantOrderLayout({ children }: LayoutProps<"/order/[slug]">) {
  return children;
}
