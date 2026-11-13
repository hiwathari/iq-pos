import { fontStack, googleFontsImport } from "../fonts";
import type { Design, SiteData } from "./types";

// Small helpers every design uses.

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function money(price: string): string {
  const p = price.trim();
  return /^\d+(\.\d{1,2})?$/.test(p) ? `£${Number(p).toFixed(2)}` : p;
}

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Black or white, whichever reads better on this colour (button text on the brand colour). */
export const readableOn = (hex: string) => (isHex(hex) && lum(hex) > 0.4 ? "#141414" : "#ffffff");

export const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
export const telUrl = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export function igUrl(handle: string) {
  const h = handle.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/$/, "");
  return h ? `https://www.instagram.com/${encodeURIComponent(h)}/` : "";
}

export interface Palette {
  dark: { bg: string; surface: string; text: string };
  light: { bg: string; surface: string; text: string };
}

/** The :root custom properties for a design — colours, mode palette and fonts. */
export function rootCss(d: Design, palette: Palette): string {
  const p = d.mode === "dark" ? palette.dark : palette.light;
  const muted = d.mode === "dark" ? "rgba(255,255,255,.66)" : "rgba(20,20,20,.64)";
  const line = d.mode === "dark" ? "rgba(255,255,255,.14)" : "rgba(20,20,20,.12)";
  return `${googleFontsImport([d.headingFont, d.bodyFont])}:root{--primary:${d.primary};--on-primary:${readableOn(d.primary)};--accent:${d.accent};--bg:${p.bg};--surface:${p.surface};--text:${p.text};--muted:${muted};--line:${line};--font-h:${fontStack(d.headingFont)};--font-b:${fontStack(d.bodyFont)}}`;
}

/** CSS shared by every design: reset, layout, buttons, menu list, footer. */
export const BASE_CSS = `
html{scroll-behavior:smooth}
body{background:var(--bg);color:var(--text);font-family:var(--font-b);line-height:1.6;-webkit-font-smoothing:antialiased}
h1,h2,h3,h4{font-family:var(--font-h);line-height:1.15;margin:0 0 .5em;font-weight:700}
p{margin:0 0 1em}a{color:inherit}
.iq-wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.iq-section{padding:72px 0}
.iq-eyebrow{display:block;text-transform:uppercase;letter-spacing:.18em;font-size:.78rem;color:var(--primary);margin-bottom:.9em;font-weight:600}
.iq-btn{display:inline-block;padding:13px 26px;border-radius:999px;background:var(--primary);color:var(--on-primary);text-decoration:none;font-weight:600;font-size:.95rem;border:2px solid var(--primary)}
.iq-btn-ghost{background:transparent;color:var(--text);border-color:var(--line)}
.iq-muted{color:var(--muted)}
.iq-grid{display:grid;gap:22px}
.iq-cols-2{grid-template-columns:repeat(2,1fr)}.iq-cols-3{grid-template-columns:repeat(3,1fr)}.iq-cols-4{grid-template-columns:repeat(4,1fr)}
.iq-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.iq-card-body{padding:20px}
.iq-card img{display:block;width:100%;height:190px;object-fit:cover}
.iq-menu-cat{margin:0 0 40px}
.iq-menu-cat h3{font-size:1.5rem;margin-bottom:.8em;padding-bottom:.4em;border-bottom:1px solid var(--line)}
.iq-menu-row{display:flex;gap:14px;align-items:baseline;margin-bottom:.9em}
.iq-menu-row .iq-dots{flex:1;border-bottom:1px dotted var(--line);transform:translateY(-4px)}
.iq-menu-row strong{font-weight:600}.iq-menu-row .iq-price{color:var(--primary);font-weight:700;white-space:nowrap}
.iq-menu-desc{display:block;color:var(--muted);font-size:.9rem;font-weight:400}
.iq-gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.iq-gallery img{width:100%;height:240px;object-fit:cover;border-radius:12px;display:block}
.iq-nav{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.iq-nav .iq-wrap{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:68px;flex-wrap:wrap}
.iq-logo{font-family:var(--font-h);font-size:1.35rem;font-weight:700;text-decoration:none;display:flex;align-items:center;gap:10px}
.iq-logo img{height:40px;width:auto;display:block}
.iq-links{display:flex;gap:22px;flex-wrap:wrap}.iq-links a{text-decoration:none;font-size:.82rem;text-transform:uppercase;letter-spacing:.1em;opacity:.85}
.iq-footer{border-top:1px solid var(--line);padding:36px 0;font-size:.9rem}
.iq-footer .iq-wrap{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap}
@media(max-width:820px){.iq-cols-3,.iq-cols-4,.iq-gallery{grid-template-columns:repeat(2,1fr)}.iq-section{padding:52px 0}}
@media(max-width:560px){.iq-cols-2,.iq-cols-3,.iq-cols-4,.iq-gallery{grid-template-columns:1fr}.iq-links{gap:14px}.iq-nav .iq-wrap{justify-content:center}}
`;

export function navHtml(d: SiteData, links: [string, string][], cta?: { label: string; href: string }): string {
  const logo = d.logoUrl ? `<img src="${esc(d.logoUrl)}" alt="${esc(d.name)} logo">` : "";
  return `<header class="iq-nav"><div class="iq-wrap"><a class="iq-logo" href="#top">${logo}<span>${esc(d.name)}</span></a><nav class="iq-links">${links.map(([l, h]) => `<a href="${h}">${esc(l)}</a>`).join("")}</nav>${cta ? `<a class="iq-btn" href="${esc(cta.href)}">${esc(cta.label)}</a>` : ""}</div></header>`;
}

export function menuHtml(d: SiteData, opts?: { title?: string; eyebrow?: string }): string {
  if (!d.menu.length) return "";
  const cats = d.menu
    .map(
      (c) =>
        `<div class="iq-menu-cat"><h3>${esc(c.category)}</h3>${c.items
          .map((i) => `<div class="iq-menu-row"><span><strong>${esc(i.name)}</strong>${i.description ? `<span class="iq-menu-desc">${esc(i.description)}</span>` : ""}</span><span class="iq-dots"></span><span class="iq-price">${esc(money(i.price))}</span></div>`)
          .join("")}</div>`
    )
    .join("");
  return `<section id="menu" class="iq-section"><div class="iq-wrap"><span class="iq-eyebrow">${esc(opts?.eyebrow ?? "Our menu")}</span><h2>${esc(opts?.title ?? "The menu")}</h2><div class="iq-grid iq-cols-2" style="gap:0 56px;margin-top:28px">${cats}</div></div></section>`;
}

export function galleryHtml(d: SiteData): string {
  const imgs = d.photos.slice(0, 6);
  if (imgs.length < 2) return "";
  return `<section id="gallery" class="iq-section"><div class="iq-wrap"><span class="iq-eyebrow">Gallery</span><h2>A taste of ${esc(d.name)}</h2><div class="iq-gallery" style="margin-top:24px">${imgs.map((u, i) => `<img src="${esc(u)}" alt="${esc(d.name)} photo ${i + 1}" loading="lazy">`).join("")}</div></div></section>`;
}

export function contactHtml(d: SiteData): string {
  const rows: string[] = [];
  if (d.address) rows.push(`<p><strong>📍 Find us</strong><br>${esc(d.address)}<br><a href="${mapsUrl(d.address)}" target="_blank">Get directions</a></p>`);
  if (d.phone) rows.push(`<p><strong>📞 Call</strong><br><a href="${telUrl(d.phone)}">${esc(d.phone)}</a></p>`);
  if (d.email) rows.push(`<p><strong>✉️ Email</strong><br><a href="mailto:${esc(d.email)}">${esc(d.email)}</a></p>`);
  if (d.hours.length) rows.push(`<p><strong>🕐 Opening hours</strong><br>${d.hours.map(esc).join("<br>")}</p>`);
  const ig = igUrl(d.instagram);
  if (ig) rows.push(`<p><strong>📷 Instagram</strong><br><a href="${ig}" target="_blank">@${esc(d.instagram.replace(/^@/, ""))}</a></p>`);
  if (!rows.length) return "";
  return `<section id="contact" class="iq-section"><div class="iq-wrap"><span class="iq-eyebrow">Visit us</span><h2>Come and see us</h2><div class="iq-grid iq-cols-2" style="margin-top:24px">${rows.map((r) => `<div class="iq-card"><div class="iq-card-body">${r}</div></div>`).join("")}</div></div></section>`;
}

export function footerHtml(d: SiteData): string {
  return `<footer class="iq-footer"><div class="iq-wrap"><span>© ${esc(d.name)}</span><span class="iq-muted">${d.address ? esc(d.address) : ""}</span></div></footer>`;
}

/** The first sentence or two of the about text, for the hero. */
export function lead(s: string, max = 160): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "));
  return stop > 60 ? cut.slice(0, stop + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}
