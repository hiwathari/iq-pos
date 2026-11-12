"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";

// Zoom for the Till (the + / − buttons): how big the whole Till is drawn. A per-device
// preference (stored in this browser), since it depends on that screen's size and how far the
// cashier sits from it — same idea as the Kitchen Display's text size.
const KEY = "till-zoom";
const STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.4, 1.6];
const DEFAULT_INDEX = 2;

export function useTillZoom() {
  const [index, setIndex] = useState(DEFAULT_INDEX);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const n = Number(raw);
      // Deferred a tick so this doesn't set state synchronously within the effect body.
      if (raw !== null && STEPS[n] !== undefined) setTimeout(() => setIndex(n), 0);
    } catch {
      // Storage unavailable (private mode, locked-down kiosk browser) — the default size is used.
    }
  }, []);
  function change(delta: 1 | -1) {
    setIndex((prev) => {
      const next = Math.min(STEPS.length - 1, Math.max(0, prev + delta));
      try {
        localStorage.setItem(KEY, String(next));
      } catch {
        // The size still applies for this session even if it can't be remembered.
      }
      return next;
    });
  }
  return { scale: STEPS[index], index, canZoomIn: index < STEPS.length - 1, canZoomOut: index > 0, zoomIn: () => change(1), zoomOut: () => change(-1) };
}

export function ZoomButtons({ zoom, className = "", compact = false }: { zoom: ReturnType<typeof useTillZoom>; className?: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-0.5 rounded-xl border border-neutral-200 bg-white p-0.5 ${className}`} role="group" aria-label="Zoom" title={`Zoom ${Math.round(zoom.scale * 100)}%`}>
      <button
        onClick={zoom.zoomOut}
        disabled={!zoom.canZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
        className={`flex items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-30 ${compact ? "h-10 w-10 @max-5xl:h-9 @max-5xl:w-9" : "h-10 w-10"}`}
      >
        <Minus className="h-5 w-5" />
      </button>
      <span className={`text-center text-xs font-semibold text-neutral-500 ${compact ? "w-11 @max-5xl:hidden" : "w-11"}`} aria-live="polite">
        {Math.round(zoom.scale * 100)}%
      </span>
      <button
        onClick={zoom.zoomIn}
        disabled={!zoom.canZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
        className={`flex items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 disabled:opacity-30 ${compact ? "h-10 w-10 @max-5xl:h-9 @max-5xl:w-9" : "h-10 w-10"}`}
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

// Touch screens (tablets, phones) show an on-screen keyboard over the bottom of the page when the
// search box is used. While `active`, this reports the part of the screen that is really visible
// (above the keyboard), so the Till can fit itself into it; null when there is no keyboard, or the
// device has none to show.
export function useVisibleArea(active: boolean) {
  const [area, setArea] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) {
      const t = setTimeout(() => setArea(null), 0);
      return () => clearTimeout(t);
    }
    const update = () => {
      const covered = window.innerHeight - vv.height > 120;
      setArea(covered ? { height: vv.height, top: vv.offsetTop } : null);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return area;
}

// A touch screen (tablet / phone) rather than a desktop with a physical keyboard.
export function useTouchScreen() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTouch(window.matchMedia("(pointer: coarse)").matches), 0);
    return () => clearTimeout(t);
  }, []);
  return touch;
}

// The Till's two-column layout (menu + order panel) needs about 1024px. When the zoom makes the
// screen effectively narrower than that, the Till switches to the compact layout (floating order
// button + drawer) — the same one a smaller tablet gets — so nothing is squeezed.
export function useWideLayout(scale: number) {
  const [width, setWidth] = useState(1280);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    const t = setTimeout(update, 0);
    window.addEventListener("resize", update);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", update);
    };
  }, []);
  return width / scale >= 1000;
}
