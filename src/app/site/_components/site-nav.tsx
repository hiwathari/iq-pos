"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react";
import { PRODUCTS } from "@/lib/site/products";
import { ProductIcon, StatusBadge } from "./product-icon";

export function SiteNav({ base, posUrl }: { base: string; posUrl: string }) {
  const [productOpen, setProductOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!productOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setProductOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setProductOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [productOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const home = base || "/";

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5">
      <div
        className={`mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 rounded-2xl px-4 transition-colors duration-300 sm:px-6 ${
          scrolled || productOpen ? "border border-white/10 bg-[#0B0E13]/85 shadow-2xl shadow-black/40 backdrop-blur-xl" : "border border-transparent"
        }`}
      >
        <Link href={home} className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
          <img src="/brand/iq-pos-logo.png" alt="" width={34} height={34} className="h-[34px] w-[34px] object-contain" />
          <span className="font-display text-[22px] font-extrabold tracking-tight text-white">IQ</span>
        </Link>

        <nav className="hidden items-center gap-1 text-[15px] text-white/75 md:flex">
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setProductOpen((v) => !v)}
              aria-expanded={productOpen}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 hover:bg-white/5 hover:text-white"
            >
              Product
              <ChevronDown className={`h-4 w-4 transition-transform ${productOpen ? "rotate-180" : ""}`} />
            </button>
            {productOpen && (
              <div className="absolute left-1/2 top-[calc(100%+14px)] w-[760px] -translate-x-1/2 rounded-2xl border border-white/10 bg-[#0D1117] p-3 shadow-2xl shadow-black/70">
                <div className="grid grid-cols-2 gap-1">
                  {PRODUCTS.map((p) => (
                    <Link
                      key={p.slug}
                      href={`${base}/products/${p.slug}`}
                      onClick={() => setProductOpen(false)}
                      className="group flex items-center gap-3 rounded-xl p-3 hover:bg-white/[0.04]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400/20 to-teal-400/5 text-teal-200 ring-1 ring-teal-300/15">
                        <ProductIcon name={p.icon} className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[15px] font-semibold text-white">{p.name}</span>
                        <span className="block truncate text-[13px] text-white/50">{p.tagline}</span>
                      </span>
                      <StatusBadge status={p.status} />
                    </Link>
                  ))}
                </div>
                <Link
                  href={`${base}/build`}
                  onClick={() => setProductOpen(false)}
                  className="mt-2 flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 text-sm text-white/70 hover:bg-white/[0.06] hover:text-white"
                >
                  Not sure what you need? Describe your restaurant and we&apos;ll suggest a setup.
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </div>
          <Link href={`${base}/#how`} className="rounded-full px-4 py-2 hover:bg-white/5 hover:text-white">
            How it works
          </Link>
          <Link href="/faq" className="rounded-full px-4 py-2 hover:bg-white/5 hover:text-white">
            FAQ
          </Link>
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <a href={`${posUrl}/login`} className="rounded-full px-4 py-2 text-[15px] text-white/75 hover:text-white">
            Sign in
          </a>
          <Link
            href={`${base}/build`}
            className="rounded-full bg-teal-400 px-5 py-2.5 text-[15px] font-semibold text-[#04201F] shadow-[0_0_30px_-6px_rgba(45,212,191,0.7)] hover:bg-teal-300"
          >
            Get started
          </Link>
        </div>

        <button type="button" className="rounded-lg p-2 text-white md:hidden" aria-label={mobileOpen ? "Close menu" : "Open menu"} onClick={() => setMobileOpen((v) => !v)}>
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-x-0 bottom-0 top-[84px] overflow-y-auto bg-[#07090D] px-4 pb-10 md:hidden">
          <div className="mb-2 mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/40">Product</div>
          <div className="flex flex-col">
            {PRODUCTS.map((p) => (
              <Link key={p.slug} href={`${base}/products/${p.slug}`} onClick={() => setMobileOpen(false)} className="flex items-center gap-3 border-b border-white/5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-400/10 text-teal-200">
                  <ProductIcon name={p.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-white">{p.name}</span>
                  <span className="block truncate text-sm text-white/50">{p.tagline}</span>
                </span>
                <StatusBadge status={p.status} />
              </Link>
            ))}
          </div>
          <div className="mt-6 flex flex-col gap-3 text-lg text-white/80">
            <Link href={`${base}/#how`} onClick={() => setMobileOpen(false)}>How it works</Link>
            <Link href="/faq" onClick={() => setMobileOpen(false)}>FAQ</Link>
            <a href={`${posUrl}/login`}>Sign in</a>
          </div>
          <Link
            href={`${base}/build`}
            onClick={() => setMobileOpen(false)}
            className="mt-8 flex items-center justify-center gap-2 rounded-full bg-teal-400 py-3.5 font-semibold text-[#04201F]"
          >
            Get started <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </header>
  );
}
