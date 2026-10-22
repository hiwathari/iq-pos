"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronDown, Lightbulb, Search, X, ZoomIn } from "lucide-react";
import type { FaqItem, FaqSection } from "./faq";

// Searchable, sectioned FAQ. Each answer's numbered steps use the same red numbers as the markers
// on its screenshot, so "2" in the text is the box marked 2 in the picture.
export function HelpCenterClient({ sections, title = "Help Center" }: { sections: FaqSection[]; title?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(["till-overview"]));
  const [zoom, setZoom] = useState<FaqItem | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return sections;
    return sections
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => [i.q, i.a, i.tip ?? "", ...(i.steps ?? [])].join(" ").toLowerCase().includes(q)),
      }))
      .filter((s) => s.items.length > 0);
  }, [sections, q]);
  const total = filtered.reduce((n, s) => n + s.items.length, 0);

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto flex max-w-6xl gap-8 p-6">
      <nav className="sticky top-6 hidden h-fit w-56 shrink-0 lg:block">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-400">Sections</div>
        <ul className="space-y-0.5">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="block rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-white hover:text-neutral-900">
                {s.title}
                <span className="ml-1.5 text-xs text-neutral-400">{s.items.length}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-neutral-900">{title}</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Step-by-step answers with marked screenshots. The red numbers in each picture match the numbered steps.
          </p>
          <div className="relative mt-4">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help — e.g. refund, split bill, QR code, printer…"
              className="w-full rounded-2xl border border-neutral-200 bg-white py-3.5 pl-12 pr-12 text-base outline-none focus:border-[var(--brand)]"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-xl text-neutral-400 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {q && (
            <p className="mt-2 text-sm text-neutral-500">
              {total} answer{total === 1 ? "" : "s"} for &ldquo;{query}&rdquo;
            </p>
          )}
        </div>

        {filtered.map((section) => (
          <section key={section.id} id={section.id} className="mb-10 scroll-mt-6">
            <h2 className="text-lg font-semibold text-neutral-900">{section.title}</h2>
            <p className="mb-3 text-sm text-neutral-500">{section.intro}</p>
            <div className="space-y-2">
              {section.items.map((item) => {
                const isOpen = Boolean(q) || open.has(item.id);
                return (
                  <div key={item.id} id={item.id} className="scroll-mt-6 rounded-2xl border border-neutral-200 bg-white">
                    <button
                      onClick={() => toggle(item.id)}
                      aria-expanded={isOpen}
                      className="flex min-h-14 w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
                    >
                      <span className="text-[15px] font-semibold text-neutral-900">{item.q}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {item.who && item.who !== "Everyone" && (
                          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-500">{item.who}</span>
                        )}
                        <ChevronDown className={`h-5 w-5 text-neutral-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-neutral-100 px-5 pb-5 pt-4">
                        {/* Wide screenshots go full-width under the steps so the markings stay readable; phone
                            screenshots sit beside them. */}
                        <div className={`grid gap-5 ${item.portrait ? "md:grid-cols-[1fr_240px]" : ""}`}>
                          <div>
                            <p className="text-[15px] leading-relaxed text-neutral-700">{item.a}</p>
                            {item.steps && (
                              <ol className="mt-4 space-y-2.5">
                                {item.steps.map((step, i) => (
                                  <li key={i} className="flex gap-3 text-[15px] text-neutral-800">
                                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
                                      {i + 1}
                                    </span>
                                    <span>{step}</span>
                                  </li>
                                ))}
                              </ol>
                            )}
                            {item.tip && (
                              <div className="mt-4 flex gap-2 rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
                                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{item.tip}</span>
                              </div>
                            )}
                          </div>
                          {item.image && (
                            <button
                              onClick={() => setZoom(item)}
                              className="group relative block self-start overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 text-left"
                              aria-label={`Enlarge screenshot: ${item.q}`}
                            >
                              <Image
                                src={`/help/${item.image}.webp`}
                                alt={`Screenshot: ${item.q}`}
                                width={item.portrait ? 390 : 1280}
                                height={item.portrait ? 844 : 800}
                                className="h-auto w-full"
                              />
                              <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                                <ZoomIn className="h-3.5 w-3.5" /> Enlarge
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center text-sm text-neutral-500">
            Nothing matched &ldquo;{query}&rdquo;. Try a simpler word, like &ldquo;table&rdquo;, &ldquo;card&rdquo; or &ldquo;print&rdquo;.
          </div>
        )}
      </div>

      {zoom?.image && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          <button
            onClick={() => setZoom(null)}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <Image
            src={`/help/${zoom.image}.webp`}
            alt={`Screenshot: ${zoom.q}`}
            width={zoom.portrait ? 390 : 1280}
            height={zoom.portrait ? 844 : 800}
            className={`h-auto max-h-full w-auto rounded-xl ${zoom.portrait ? "max-w-sm" : "max-w-full"}`}
          />
        </div>
      )}
    </div>
  );
}
