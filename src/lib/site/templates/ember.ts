import { BASE_CSS, contactHtml, esc, footerHtml, galleryHtml, igUrl, mapsUrl, menuHtml, navHtml, rootCss, telUrl, type Palette } from "./kit";
import type { Design, SiteData, TemplateInfo } from "./types";

// "Ember" — warm steakhouse look: condensed capitals, full-bleed hero, info boxes along the bottom.
export const EMBER: TemplateInfo = {
  id: "ember",
  name: "Ember Grill",
  blurb: "Warm, bold steakhouse style with a full-width hero and quick-info boxes.",
  defaults: { template: "ember", primary: "#D8402B", accent: "#F2B66D", mode: "dark", headingFont: "Oswald", bodyFont: "Lato" },
};

const PALETTE: Palette = {
  dark: { bg: "#1a0f0b", surface: "#26160f", text: "#f6ece3" },
  light: { bg: "#fbf4ec", surface: "#ffffff", text: "#25150e" },
};

export function renderEmber(d: SiteData, design: Design): { html: string; css: string } {
  const hero = d.photos[0]
    ? `background-image:linear-gradient(180deg,rgba(20,8,4,.35),rgba(20,8,4,.85)),url('${esc(d.photos[0])}')`
    : `background-image:radial-gradient(900px 420px at 20% 0%,color-mix(in srgb,var(--primary) 38%,transparent),transparent),linear-gradient(180deg,var(--surface),var(--bg))`;
  const links: [string, string][] = [["Home", "#top"], ["About", "#about"]];
  if (d.menu.length) links.push(["Menus", "#menu"]);
  if (d.hours.length || d.address) links.push(["Hours & Location", "#contact"]);
  if (d.photos.length >= 2) links.push(["Gallery", "#gallery"]);
  const boxes: string[] = [];
  if (d.hours.length) boxes.push(`<div class="ember-box"><h3>Opening hours</h3><p>${d.hours.slice(0, 4).map(esc).join("<br>")}</p></div>`);
  if (d.address) boxes.push(`<div class="ember-box"><h3>Find us</h3><p>${esc(d.address)}</p><a href="${mapsUrl(d.address)}" target="_blank">Directions</a></div>`);
  if (d.phone) boxes.push(`<div class="ember-box"><h3>Book a table</h3><p>${esc(d.phone)}</p><a href="${telUrl(d.phone)}">Call now</a></div>`);
  if (d.orderUrl) boxes.push(`<div class="ember-box"><h3>Order online</h3><p>Collection &amp; delivery</p><a href="${esc(d.orderUrl)}">Order now</a></div>`);
  else if (d.menu.length) boxes.push(`<div class="ember-box"><h3>The menu</h3><p>See what's cooking</p><a href="#menu">View menu</a></div>`);
  const ig = igUrl(d.instagram);

  const html = `<div id="top"></div><div class="ember-top"><div class="iq-wrap"><span>${esc(d.cuisine || d.tagline || "Welcome")}</span>${ig ? `<a href="${ig}" target="_blank">Instagram</a>` : d.phone ? `<a href="${telUrl(d.phone)}">${esc(d.phone)}</a>` : ""}</div></div>
${navHtml(d, links)}
<section class="ember-hero" style="${hero}"><div class="iq-wrap"><h1>${esc(d.name)}</h1>${d.tagline ? `<p class="ember-sub">${esc(d.tagline)}</p>` : ""}${boxes.length ? `<div class="ember-boxes">${boxes.slice(0, 4).join("")}</div>` : ""}</div></section>
<section id="about" class="iq-section"><div class="iq-wrap" style="max-width:760px;text-align:center"><span class="iq-eyebrow">About</span><h2>${esc(d.name)}</h2><p class="iq-muted">${esc(d.about || (d.cuisine ? `${d.cuisine} cooking, done properly.` : ""))}</p></div></section>
${menuHtml(d, { title: "From the grill", eyebrow: "Menus" })}${galleryHtml(d)}${contactHtml(d)}${footerHtml(d)}`;

  const css = `${rootCss(design, PALETTE)}${BASE_CSS}
h1,h2,h3{text-transform:uppercase;letter-spacing:.04em}
.ember-top{background:var(--primary);color:var(--on-primary);font-size:.78rem;text-transform:uppercase;letter-spacing:.14em}
.ember-top .iq-wrap{display:flex;justify-content:space-between;padding-top:7px;padding-bottom:7px}.ember-top a{text-decoration:none}
.iq-nav .iq-wrap{justify-content:center;flex-direction:column;gap:4px;padding-top:10px;padding-bottom:10px}
.iq-logo{font-size:1.7rem;letter-spacing:.08em;text-transform:uppercase}
.ember-hero{min-height:84vh;display:flex;align-items:flex-end;background-size:cover;background-position:center;padding:60px 0 0;color:#f6ece3}
.ember-hero .iq-wrap{width:100%}
.ember-hero h1{font-size:clamp(2.4rem,7vw,5rem);color:#f6ece3;margin-bottom:.15em}
.ember-sub{font-size:1.15rem;max-width:36rem;opacity:.9}
.ember-boxes{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin-top:40px;background:rgba(255,255,255,.18)}
.ember-box{background:rgba(20,8,4,.82);padding:20px;backdrop-filter:blur(4px)}
.ember-box h3{font-size:1rem;color:var(--accent);margin-bottom:.4em}.ember-box p{font-size:.92rem;opacity:.9;margin-bottom:.6em}
.ember-box a{color:var(--accent);font-size:.78rem;text-transform:uppercase;letter-spacing:.12em;text-decoration:none;border-bottom:1px solid currentColor}
.iq-btn{border-radius:0;text-transform:uppercase;letter-spacing:.12em}
.iq-card{border-radius:0}
@media(max-width:820px){.ember-boxes{grid-template-columns:repeat(2,1fr)}.iq-cols-2{grid-template-columns:1fr}}
@media(max-width:520px){.ember-boxes{grid-template-columns:1fr}}`;
  return { html, css };
}
