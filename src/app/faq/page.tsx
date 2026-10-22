import type { Metadata } from "next";
import { FAQ } from "@/app/help-center/faq";
import { HelpCenterClient } from "@/app/help-center/help-center-client";

export const metadata: Metadata = {
  title: "FAQ & how-to · IQ POS",
  description: "Step-by-step answers with marked screenshots for taking orders, payments, tables, the kitchen display, setup and closing the day in IQ POS.",
  icons: { icon: "/brand/iq-pos-logo.png", apple: "/brand/iq-pos-logo.png" },
};

// The public copy of the in-app Help Center — same questions, answers and screenshots, no
// sign-in needed. Reachable on pos.luvder.com/faq and iq.luvder.com/faq (the proxy lets /faq
// through on the site host untouched).
export default function PublicFaqPage() {
  return (
    <div className="min-h-screen bg-neutral-50 [--brand:#0B8584]">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <a href="https://iq.luvder.com" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static brand mark */}
            <img src="/brand/iq-pos-logo.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
            <span className="text-[17px] font-bold tracking-tight text-neutral-900">
              IQ <span className="text-teal-600">POS</span>
            </span>
          </a>
          <nav className="flex items-center gap-1 text-sm">
            <a href="https://iq.luvder.com" className="hidden rounded-lg px-3 py-2 text-neutral-600 hover:bg-neutral-100 sm:block">
              IQ website
            </a>
            <a href="https://pos.luvder.com/login" className="rounded-lg bg-teal-600 px-4 py-2 font-semibold text-white hover:bg-teal-700">
              Sign in
            </a>
          </nav>
        </div>
      </header>
      <HelpCenterClient sections={FAQ} title="FAQ & how-to" />
    </div>
  );
}
