import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans } from "next/font/google";
import { getSiteBase, POS_URL } from "./_components/site-base";
import { SiteFooter } from "./_components/site-footer";
import { SiteNav } from "./_components/site-nav";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["600", "700", "800"], variable: "--font-site-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-site-body" });

export const metadata: Metadata = {
  metadataBase: new URL("https://iq.luvder.com"),
  title: { default: "IQ — POS, website and guest apps for restaurants", template: "%s · IQ" },
  description:
    "Describe your restaurant and IQ builds the website. Then run orders, tables, loyalty and payments from one POS built for independent restaurants, cafés and takeaways.",
  icons: { icon: "/brand/iq-pos-logo.png", apple: "/brand/iq-pos-logo.png" },
  openGraph: { type: "website", siteName: "IQ", images: [{ url: "/site/shots/till.webp", width: 1600, height: 1000 }] },
};

export default async function SiteLayout({ children }: LayoutProps<"/site">) {
  const base = await getSiteBase();
  return (
    <div className={`${display.variable} ${body.variable} flex min-h-screen flex-col bg-[#07090D] font-site text-white antialiased selection:bg-teal-300/30`}>
      <SiteNav base={base} posUrl={POS_URL} />
      <main className="flex-1 overflow-x-clip">{children}</main>
      <SiteFooter base={base} posUrl={POS_URL} />
    </div>
  );
}
