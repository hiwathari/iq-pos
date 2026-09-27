import type { CSSProperties } from "react";

// IQ POS's own default brand color (matches Tailwind's teal-600, used everywhere before
// per-restaurant branding existed) — the fallback whenever a restaurant hasn't set one.
export const DEFAULT_BRAND_COLOR = "#0d9488";

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidHexColor(value: string): boolean {
  return HEX_RE.test(value.trim());
}

function clamp255(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

// Blends a hex color toward white (amount > 0) or black (amount < 0) — a cheap stand-in for a
// full Tailwind shade scale, just enough to get a hover-darkened and a light-tint variant out
// of the one color a restaurant picks.
export function shadeColor(hex: string, amount: number): string {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const mix = (channel: number) => (amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount));

  return `#${[mix(r), mix(g), mix(b)]
    .map((v) => clamp255(v).toString(16).padStart(2, "0"))
    .join("")}`;
}

// The three CSS custom properties every branded surface reads from — set once on a wrapping
// element (AppShell / LockedShell) and inherited by every descendant via normal CSS cascade,
// so no component needs the restaurant's color threaded through as a prop.
export function brandCssVars(brandColor: string | null | undefined): CSSProperties {
  const base = brandColor && isValidHexColor(brandColor) ? brandColor : DEFAULT_BRAND_COLOR;
  return {
    "--brand": base,
    "--brand-dark": shadeColor(base, -0.15),
    "--brand-light": shadeColor(base, 0.92),
  } as CSSProperties;
}
