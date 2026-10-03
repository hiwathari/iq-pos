import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getActiveRestaurantId, getSession } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The browser tab icon (and whatever a plain "Add to Home Screen"/"Create Shortcut" picks up,
// absent a page-specific manifest) defaults to the generic mark — once a session is resolved to
// a specific restaurant, it switches to that restaurant's own logo via the same composited icon
// route Till/Kitchen already use. A page under this layout that sets its own `icons` (Till,
// Kitchen, their login screens) overrides this, rather than merging with it.
export async function generateMetadata(): Promise<Metadata> {
  let restaurantId: string | null = null;
  try {
    const session = await getSession();
    if (session) restaurantId = await getActiveRestaurantId(session);
  } catch {
    // No session yet (login page, public pages) — falls back to the generic icon below.
  }

  // `restaurant` isn't read by the route itself (it re-derives the session there too) — it's
  // only here so the icon URL itself changes between restaurants/logged-out, since browsers
  // cache a favicon URL aggressively otherwise.
  const restaurantParam = restaurantId ? `&restaurant=${restaurantId}` : "";
  return {
    title: "IQ POS",
    description: "Multi-restaurant point of sale platform",
    icons: {
      icon: `/api/pwa-icon/dashboard?size=64${restaurantParam}`,
      apple: `/api/pwa-icon/dashboard?size=180${restaurantParam}`,
    },
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
