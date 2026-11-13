import { BASE_CSS, contactHtml, esc, footerHtml, galleryHtml, lead, menuHtml, money, navHtml, rootCss, telUrl, type Palette } from "./kit";
import type { Design, SiteData, TemplateInfo } from "./types";

// "Fresh" — light, friendly bistro: soft cream, rounded cards, a centred hero and a card-based menu.
export const FRESH: TemplateInfo = {
  id: "fresh",
  name: "Fresh Bistro",
  blurb: "Light, friendly and modern — rounded cards, a centred hero and a card-style menu.",
  defaults: { template: "fresh", primary: "#D9622B", accent: "#2F7A5B", mode: "light", headingFont: "DM Serif Display", bodyFont: "DM Sans" },
};

const PALETTE: Palette = {
  dark: { bg: "#14110e", surface: "#1e1a16", text: "#f6efe6" },
  light: { bg: "#fbf6ee", surface: "#ffffff", text: "#27211b" },
};

export function renderFresh(d: SiteData, design: Design): { html: string; css: string } {
  const links: [string, string][] = [["Home", "#top"], ["About", "#about"]];
  if (d.menu.length) links.push(["Menu", "#menu"]);
  if (d.photos.length >= 2) links.push(["Gallery", "#gallery"]);
  links.push(["Contact", "#contact"]);
  const cta = d.orderUrl ? { label: "Order online", href: d.orderUrl } : d.phone ? { label: "Call us", href: telUrl(d.phone) } : undefined;
  const heroImg = d.photos[0] ? `<img class="fresh-hero-img" src="${esc(d.photos[0])}" alt="${esc(d.name)}">` : "";
  const picks = d.menu.flatMap((c) => c.items.map((i) => ({ ...i, category: c.category }))).slice(0, 6);

  const html = `<div id="top"></div>${navHtml(d, links, cta)}
<section class="fresh-hero"><div class="iq-wrap"><span class="iq-eyebrow">${esc(d.cuisine || "Welcome")}</span><h1>${esc(d.name)}</h1><p class="fresh-sub">${esc(d.tagline || lead(d.about, 140))}</p><div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">${d.menu.length ? `<a class="iq-btn" href="#menu">See the menu</a>` : ""}${cta ? `<a class="iq-btn iq-btn-ghost" href="${esc(cta.href)}">${esc(cta.label)}</a>` : ""}</div>${heroImg}</div></section>
<section id="about" class="iq-section"><div class="iq-wrap" style="max-width:780px;text-align:center"><span class="iq-eyebrow">Our story</span><h2>About ${esc(d.name)}</h2><p class="iq-muted" style="font-size:1.08rem">${esc(d.about || (d.cuisine ? `${d.cuisine} food, made fresh and served with a smile.` : ""))}</p></div></section>
${picks.length ? `<section id="menu" class="iq-section" style="padding-top:0"><div class="iq-wrap"><span class="iq-eyebrow">Menu</span><h2>What's on</h2><div class="iq-grid iq-cols-3" style="margin-top:24px">${picks.map((x) => `<div class="iq-card fresh-dish">${x.image ? `<img src="${esc(x.image)}" alt="${esc(x.name)}">` : ""}<div class="iq-card-body"><span class="iq-muted" style="font-size:.78rem;text-transform:uppercase;letter-spacing:.1em">${esc(x.category)}</span><h3 style="font-size:1.2rem;margin:.25em 0 .3em">${esc(x.name)}</h3>${x.description ? `<p class="iq-muted" style="font-size:.92rem;margin-bottom:.6em">${esc(x.description)}</p>` : ""}<strong style="color:var(--primary);font-size:1.05rem">${esc(money(x.price))}</strong></div></div>`).join("")}</div></div></section>
${d.menu.flatMap((c) => c.items).length > picks.length ? menuHtml({ ...d, menu: d.menu }, { title: "The full menu", eyebrow: "Everything" }).replace('id="menu"', 'id="full-menu"') : ""}` : ""}
${galleryHtml(d)}${contactHtml(d)}${footerHtml(d)}`;

  const css = `${rootCss(design, PALETTE)}${BASE_CSS}
.fresh-hero{padding:84px 0 56px;text-align:center;background:linear-gradient(180deg,color-mix(in srgb,var(--primary) 14%,var(--bg)),var(--bg))}
.fresh-hero h1{font-size:clamp(2.6rem,7vw,4.8rem);margin-bottom:.25em}
.fresh-sub{font-size:1.15rem;max-width:36rem;margin:0 auto 1.6em;color:var(--muted)}
.fresh-hero-img{display:block;margin:44px auto 0;width:100%;max-width:880px;height:360px;object-fit:cover;border-radius:28px}
.fresh-dish{border-radius:22px;transition:transform .2s}.fresh-dish:hover{transform:translateY(-4px)}
.iq-card{border-radius:22px;box-shadow:0 8px 24px -16px rgba(0,0,0,.35)}
.iq-gallery img{border-radius:22px}
@media(max-width:820px){.iq-cols-2{grid-template-columns:1fr}}`;
  return { html, css };
}
