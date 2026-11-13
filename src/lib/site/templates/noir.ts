import { BASE_CSS, contactHtml, esc, footerHtml, galleryHtml, menuHtml, money, navHtml, rootCss, telUrl, type Palette } from "./kit";
import type { Design, SiteData, TemplateInfo } from "./types";

// "Noir" — dark, gold-accented fine dining: big serif headline, about + visit card, signature dish cards.
export const NOIR: TemplateInfo = {
  id: "noir",
  name: "Noir & Gold",
  blurb: "Dark, elegant fine dining with a big serif headline and signature-dish cards.",
  defaults: { template: "noir", primary: "#C9A24B", accent: "#E8D6A4", mode: "dark", headingFont: "Playfair Display", bodyFont: "Inter" },
};

const PALETTE: Palette = {
  dark: { bg: "#0c0c0d", surface: "#161617", text: "#f5f1e8" },
  light: { bg: "#faf7f0", surface: "#ffffff", text: "#1b1a17" },
};

export function renderNoir(d: SiteData, design: Design): { html: string; css: string } {
  const dishes = d.menu.flatMap((c) => c.items.map((i) => ({ ...i, category: c.category }))).slice(0, 4);
  const hero = d.photos[0]
    ? `background-image:linear-gradient(180deg,rgba(0,0,0,.55),rgba(0,0,0,.78)),url('${esc(d.photos[0])}')`
    : `background-image:radial-gradient(1200px 500px at 70% -10%,color-mix(in srgb,var(--primary) 30%,transparent),transparent),linear-gradient(180deg,var(--surface),var(--bg))`;
  const call = d.phone ? { label: "Book a table", href: telUrl(d.phone) } : d.email ? { label: "Book a table", href: `mailto:${d.email}` } : d.orderUrl ? { label: "Order online", href: d.orderUrl } : undefined;
  const links: [string, string][] = [["Home", "#top"], ["About", "#about"]];
  if (d.menu.length) links.push(["Menu", "#menu"]);
  if (d.photos.length >= 2) links.push(["Gallery", "#gallery"]);
  links.push(["Contact", "#contact"]);

  const visit = [
    d.address && `<p><strong>📍</strong> ${esc(d.address)}</p>`,
    d.phone && `<p><strong>📞</strong> <a href="${telUrl(d.phone)}">${esc(d.phone)}</a></p>`,
    d.hours.length && `<p><strong>🕐</strong> ${d.hours.map(esc).join("<br>")}</p>`,
  ].filter(Boolean).join("");

  const html = `<div id="top"></div>${navHtml(d, links, call)}
<section class="noir-hero" style="${hero}"><div class="iq-wrap"><span class="noir-kicker">Welcome to</span><h1>${esc(d.name)}</h1>${d.tagline || d.cuisine ? `<p class="noir-sub">${esc(d.tagline || d.cuisine)}</p>` : ""}<div class="noir-actions">${d.menu.length ? `<a class="iq-btn" href="#menu">Explore the menu</a>` : ""}${d.orderUrl ? `<a class="iq-btn iq-btn-ghost" href="${esc(d.orderUrl)}">Order online</a>` : call ? `<a class="iq-btn iq-btn-ghost" href="${esc(call.href)}">${esc(call.label)}</a>` : ""}</div></div></section>
<section id="about" class="iq-section"><div class="iq-wrap iq-grid iq-cols-2" style="align-items:start;gap:48px"><div><span class="iq-eyebrow">About us</span><h2>${esc(d.tagline && d.about ? d.tagline : d.name)}</h2><p class="iq-muted">${esc(d.about || (d.cuisine ? `${d.cuisine} food, made with care.` : ""))}</p></div>${visit ? `<div class="iq-card"><div class="iq-card-body"><h3>Visit us</h3>${visit}</div></div>` : ""}</div></section>
${dishes.length ? `<section class="iq-section" style="background:var(--surface)"><div class="iq-wrap"><span class="iq-eyebrow">Favourites</span><h2>Our signature dishes</h2><div class="iq-grid iq-cols-4" style="margin-top:26px">${dishes.map((x) => `<div class="iq-card">${x.image ? `<img src="${esc(x.image)}" alt="${esc(x.name)}">` : ""}<div class="iq-card-body"><span class="iq-muted" style="font-size:.78rem;text-transform:uppercase;letter-spacing:.12em">${esc(x.category)}</span><h3 style="font-size:1.1rem;margin:.3em 0">${esc(x.name)}</h3>${x.description ? `<p class="iq-muted" style="font-size:.9rem">${esc(x.description)}</p>` : ""}<strong style="color:var(--primary)">${esc(money(x.price))}</strong></div></div>`).join("")}</div></div></section>` : ""}
${menuHtml(d, { title: "Our menu" })}${galleryHtml(d)}${contactHtml(d)}${footerHtml(d)}`;

  const css = `${rootCss(design, PALETTE)}${BASE_CSS}
.noir-hero{min-height:78vh;display:flex;align-items:center;background-size:cover;background-position:center;color:#f5f1e8}
.noir-hero .iq-wrap{width:100%}
.noir-hero h1{font-size:clamp(2.6rem,7vw,5.2rem);text-transform:uppercase;letter-spacing:.03em;margin-bottom:.3em;color:#f5f1e8}
.noir-kicker{font-family:var(--font-h);font-style:italic;color:var(--primary);font-size:1.35rem;display:block;margin-bottom:.4em}
.noir-sub{font-size:1.15rem;max-width:34rem;opacity:.9;margin-bottom:1.6em}
.noir-actions{display:flex;gap:14px;flex-wrap:wrap}.noir-hero .iq-btn-ghost{color:#f5f1e8;border-color:rgba(255,255,255,.45)}
.iq-btn{border-radius:2px;text-transform:uppercase;letter-spacing:.1em;font-size:.8rem}
.iq-card{border-radius:4px}
@media(max-width:820px){.iq-cols-2{grid-template-columns:1fr}}`;
  return { html, css };
}
