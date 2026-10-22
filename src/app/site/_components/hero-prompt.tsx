"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Paperclip, Sparkles } from "lucide-react";

export const BUILD_DRAFT_KEY = "iq-build-draft";

const EXAMPLES = [
  "We're Spice Lane, a family Indian restaurant in Leeds. We want online ordering and table booking…",
  "A small specialty coffee shop in Bristol — brunch, pastries, and a loyalty card for regulars…",
  "Pizza takeaway in Manchester, open till late. Deep red and cream branding, menu attached…",
];

// The home page's prompt box: whatever is typed is handed to /build (via sessionStorage, so a
// long description doesn't end up in the URL) where the full brief continues.
export function HeroPrompt({ base }: { base: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [example, setExample] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 4200);
    return () => window.clearInterval(id);
  }, []);

  function go() {
    try {
      if (text.trim()) sessionStorage.setItem(BUILD_DRAFT_KEY, text.trim());
    } catch {
      // Private mode — /build simply starts empty.
    }
    router.push(`${base}/build`);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
      className="group relative mx-auto w-full max-w-3xl"
    >
      <div className="absolute -inset-px rounded-[26px] bg-gradient-to-r from-teal-300/60 via-emerald-200/30 to-cyan-400/60 opacity-70 blur-[2px] transition-opacity group-focus-within:opacity-100" />
      <div className="relative rounded-[25px] bg-[#0C1015] p-4 shadow-[0_30px_80px_-20px_rgba(20,189,189,0.35)] sm:p-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) go();
          }}
          rows={3}
          aria-label="Describe your restaurant"
          placeholder={EXAMPLES[example]}
          className="w-full resize-none bg-transparent text-[17px] leading-relaxed text-white placeholder:text-white/35 focus:outline-none sm:text-lg"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-white/45">
            <button type="button" onClick={go} className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 hover:border-white/25 hover:text-white/80">
              <Paperclip className="h-4 w-4" /> Logo &amp; menu
            </button>
            <span className="hidden items-center gap-1.5 sm:flex">
              <Sparkles className="h-4 w-4 text-teal-300" /> Free to start · no card needed
            </span>
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-full bg-teal-400 px-5 py-3 font-semibold text-[#04201F] shadow-[0_0_40px_-8px_rgba(45,212,191,0.9)] transition hover:bg-teal-300"
          >
            Build my website <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </form>
  );
}
