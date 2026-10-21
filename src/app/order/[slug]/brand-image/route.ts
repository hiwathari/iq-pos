import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getRestaurantBySlug } from "@/lib/data/restaurants";

// The restaurant's own logo as a public image: a square browser-tab/home-screen icon
// (?w=64&h=64) or a 1200×630 social-share card (?w=1200&h=630) — see order/[slug]/layout.tsx.
// Lives under /order/<slug>/ so a restaurant's custom ordering domain (proxy.ts) serves it
// untouched. Falls back to the IQ POS mark when the restaurant has no logo or it can't be loaded.
// The `v` query param (a hash of the logo URL) is only there to bust caches when the logo changes.

async function loadLogo(logoUrl: string | null): Promise<Buffer | null> {
  if (logoUrl) {
    try {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000) });
      const length = Number(res.headers.get("content-length") || 0);
      if (res.ok && length <= 8_000_000) return Buffer.from(await res.arrayBuffer());
    } catch {
      // Unreachable or slow logo host — fall through to the platform mark.
    }
  }
  return readFile(path.join(process.cwd(), "public/brand/iq-pos-logo.png")).catch(() => null);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getRestaurantBySlug(slug);

  const w = Math.max(16, Math.min(1200, Math.round(Number(req.nextUrl.searchParams.get("w")) || 512)));
  const h = Math.max(16, Math.min(1200, Math.round(Number(req.nextUrl.searchParams.get("h")) || w)));
  const isCard = w !== h;

  const source = await loadLogo(restaurant?.invoiceLogoUrl ?? null);
  const canvas = sharp({ create: { width: w, height: h, channels: 4, background: "#ffffff" } });

  let png: Buffer;
  try {
    if (!source) throw new Error("no logo");
    // A card keeps generous margins so the logo reads at thumbnail size in chat previews; an icon
    // fills most of its square.
    const box = Math.round(Math.min(w, h) * (isCard ? 0.72 : 0.9));
    const logo = await sharp(source).resize(box, box, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    png = await canvas.composite([{ input: logo, gravity: "center" }]).png().toBuffer();
  } catch {
    png = await canvas.png().toBuffer();
  }

  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
