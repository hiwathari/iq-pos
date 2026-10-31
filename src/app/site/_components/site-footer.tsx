import Link from "next/link";
import { PRODUCTS } from "@/lib/site/products";

export function SiteFooter({ base, posUrl }: { base: string; posUrl: string }) {
  const live = PRODUCTS.filter((p) => p.status !== "soon");
  const soon = PRODUCTS.filter((p) => p.status === "soon");
  return (
    <footer className="border-t border-white/5 bg-[#05070A]">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr] sm:px-8">
        <div className="max-w-xs">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
            <img src="/brand/iq-pos-logo.png" alt="" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
            <span className="font-display text-xl font-extrabold text-white">IQ</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-white/50">
            The POS, website and guest apps for independent restaurants, cafés and takeaways — run from one place.
          </p>
        </div>
        <FooterCol title="Available now" links={live.map((p) => ({ href: `${base}/products/${p.slug}`, label: p.name }))} />
        <FooterCol title="Coming soon" links={soon.map((p) => ({ href: `${base}/products/${p.slug}`, label: p.name }))} />
        <FooterCol
          title="IQ"
          links={[
            { href: `${base}/pricing`, label: "Pricing" },
            { href: `${base}/build`, label: "Build my website" },
            { href: "/faq", label: "FAQ & how-to" },
            { href: `${posUrl}/login`, label: "Sign in to IQ POS" },
          ]}
        />
      </div>
      <div className="border-t border-white/5 py-6 text-center text-xs text-white/35">© {new Date().getFullYear()} IQ · luvder.com</div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-white/35">{title}</div>
      <ul className="mt-4 flex flex-col gap-2.5 text-sm text-white/65">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="hover:text-white">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
