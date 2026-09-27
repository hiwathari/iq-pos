import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { getActiveRestaurantId, getSession } from "@/lib/auth";
import { getRestaurant } from "@/lib/data/restaurants";

const BRAND: Record<string, { label: string; letter: string; color: string }> = {
  till: { label: "TILL", letter: "T", color: "#0d9488" },
  kitchen: { label: "KITCHEN", letter: "K", color: "#d97706" },
};

// Satori (which ImageResponse renders through) can only decode PNG/JPEG — a WebP or AVIF
// logo silently fails to draw. Fetching it ourselves and normalizing through sharp means any
// format the restaurant's logo happens to be in still renders correctly.
async function loadLogoAsPngDataUrl(logoUrl: string): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    const png = await sharp(bytes).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

// Generates the home-screen icon for the Till/Kitchen "app". Before a device is logged in
// there's no restaurant context yet, so it falls back to a plain branded icon — once signed
// in (viewing /order-line or /kitchen), it composites the restaurant's own logo instead.
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const brand = BRAND[kind] ?? BRAND.till;
  const size = Number(req.nextUrl.searchParams.get("size")) || 512;
  const badgeSize = Math.round(size * 0.34);

  let logoUrl: string | null = null;
  try {
    const session = await getSession();
    if (session) {
      const restaurantId = await getActiveRestaurantId(session);
      if (restaurantId) {
        const restaurant = await getRestaurant(restaurantId);
        logoUrl = restaurant?.invoiceLogoUrl || null;
      }
    }
  } catch {
    // No session / restaurant available yet — fall back to the generic branded icon below.
  }

  const logoDataUrl = logoUrl ? await loadLogoAsPngDataUrl(logoUrl) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          alignItems: "center",
          justifyContent: "center",
          background: logoDataUrl ? "#ffffff" : brand.color,
        }}
      >
        {logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoDataUrl}
            width={size}
            height={size}
            style={{ objectFit: "cover" }}
            alt=""
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: size * 0.1, fontWeight: 700, color: "white", letterSpacing: 4 }}>IQ POS</div>
            <div style={{ fontSize: size * 0.07, color: "rgba(255,255,255,0.85)", letterSpacing: 3, marginTop: size * 0.02 }}>
              {brand.label}
            </div>
          </div>
        )}

        <div
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
            width: badgeSize,
            height: badgeSize,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: brand.color,
            color: "white",
            fontSize: badgeSize * 0.55,
            fontWeight: 700,
            borderTopLeftRadius: badgeSize * 0.4,
            border: `${Math.max(2, size * 0.008)}px solid white`,
          }}
        >
          {brand.letter}
        </div>
      </div>
    ),
    { width: size, height: size }
  );
}
