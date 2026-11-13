import type { Design } from "./templates";

// Ready-made containers ("sections") and elements the customer can drop into their page in the editor.
// Colours come from the current design through CSS variables (templates define them) with the design's own
// colour as the fallback, so blocks also look right on an AI-written page that has no variables.

export interface SiteBlock {
  id: string;
  label: string;
  category: string;
  media: string;
  content: string;
}

const icon = (emoji: string) => `<div style="font-size:26px;line-height:1">${emoji}</div>`;

const PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="560" viewBox="0 0 800 560"><rect width="800" height="560" fill="#d9d4cb"/><text x="400" y="290" font-family="Arial" font-size="34" fill="#8a8378" text-anchor="middle">Replace this photo</text></svg>'
  );

export function buildBlocks(d: Design): SiteBlock[] {
  const bg = d.mode === "dark" ? "#0c0c0d" : "#faf7f0";
  const surface = d.mode === "dark" ? "#161617" : "#ffffff";
  const text = d.mode === "dark" ? "#f5f1e8" : "#1b1a17";
  const c = {
    primary: `var(--primary,${d.primary})`,
    on: "var(--on-primary,#ffffff)",
    accent: `var(--accent,${d.accent})`,
    bg: `var(--bg,${bg})`,
    surface: `var(--surface,${surface})`,
    text: `var(--text,${text})`,
    muted: "var(--muted,rgba(128,128,128,.85))",
    line: "var(--line,rgba(128,128,128,.3))",
    h: "var(--font-h,inherit)",
  };
  const btn = (label: string, href = "#contact") =>
    `<a href="${href}" style="display:inline-block;padding:13px 26px;border-radius:999px;background:${c.primary};color:${c.on};text-decoration:none;font-weight:600">${label}</a>`;
  const wrap = (inner: string, extra = "") => `<section style="padding:72px 20px;${extra}"><div style="max-width:1120px;margin:0 auto">${inner}</div></section>`;
  const h2 = (t: string) => `<h2 style="font-family:${c.h};margin:0 0 .5em;font-size:2rem">${t}</h2>`;
  const card = (inner: string) => `<div style="background:${c.surface};border:1px solid ${c.line};border-radius:14px;padding:20px;color:${c.text}">${inner}</div>`;
  const grid = (n: number, inner: string) => `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(${n === 2 ? 300 : 220}px,1fr));gap:22px">${inner}</div>`;

  return [
    // ---- Sections (containers) ----
    {
      id: "sec-hero",
      label: "Hero banner",
      category: "Sections",
      media: icon("🏞️"),
      content: wrap(`<div style="text-align:center;padding:40px 0"><h1 style="font-family:${c.h};font-size:3rem;margin:0 0 .3em">Welcome to our restaurant</h1><p style="font-size:1.15rem;color:${c.muted};max-width:34rem;margin:0 auto 1.5em">A short line that makes people hungry.</p>${btn("Book a table")}</div>`, `background:${c.surface};color:${c.text}`),
    },
    {
      id: "sec-about",
      label: "About + photo",
      category: "Sections",
      media: icon("📖"),
      content: wrap(grid(2, `<div style="align-self:center"><span style="text-transform:uppercase;letter-spacing:.16em;font-size:.78rem;color:${c.primary}">About us</span>${h2("Our story")}<p style="color:${c.muted}">Tell your guests who you are, what you cook and why.</p></div><img src="${PLACEHOLDER}" alt="About us" style="width:100%;border-radius:14px;display:block">`), `background:${c.bg};color:${c.text}`),
    },
    {
      id: "sec-menu",
      label: "Menu cards",
      category: "Sections",
      media: icon("🍽️"),
      content: wrap(`${h2("Favourites")}${grid(3, ["Dish name", "Dish name", "Dish name"].map((n) => card(`<h3 style="font-family:${c.h};margin:0 0 .3em">${n}</h3><p style="color:${c.muted};margin:0 0 .6em">A short description.</p><strong style="color:${c.primary}">£0.00</strong>`)).join(""))}`, `background:${c.bg};color:${c.text}`),
    },
    {
      id: "sec-menu-list",
      label: "Menu list",
      category: "Sections",
      media: icon("📜"),
      content: wrap(`${h2("Starters")}${["Dish one", "Dish two", "Dish three"].map((n) => `<div style="display:flex;gap:14px;align-items:baseline;margin-bottom:.8em;color:${c.text}"><strong>${n}</strong><span style="flex:1;border-bottom:1px dotted ${c.line}"></span><span style="color:${c.primary};font-weight:700">£0.00</span></div>`).join("")}`, `background:${c.bg};color:${c.text}`),
    },
    {
      id: "sec-gallery",
      label: "Photo gallery",
      category: "Sections",
      media: icon("🖼️"),
      content: wrap(`${h2("Gallery")}${grid(3, [1, 2, 3].map(() => `<img src="${PLACEHOLDER}" alt="Photo" style="width:100%;height:220px;object-fit:cover;border-radius:12px;display:block">`).join(""))}`, `background:${c.bg};color:${c.text}`),
    },
    {
      id: "sec-hours",
      label: "Opening hours",
      category: "Sections",
      media: icon("🕐"),
      content: wrap(`${h2("Opening hours")}${card(["Monday – Friday&nbsp;&nbsp;12:00 – 22:00", "Saturday&nbsp;&nbsp;12:00 – 23:00", "Sunday&nbsp;&nbsp;12:00 – 21:00"].map((l) => `<p style="margin:.3em 0">${l}</p>`).join(""))}`, `background:${c.bg};color:${c.text}`),
    },
    {
      id: "sec-contact",
      label: "Contact & map",
      category: "Sections",
      media: icon("📍"),
      content: wrap(`${h2("Find us")}${grid(3, card("<strong>📍 Address</strong><p style='margin:.4em 0 0'>1 High Street, Your Town</p><a href='https://www.google.com/maps/search/?api=1&query=Your+address' target='_blank' style='color:inherit'>Get directions</a>") + card("<strong>📞 Phone</strong><p style='margin:.4em 0 0'><a href='tel:+440000000000' style='color:inherit'>01234 567890</a></p>") + card("<strong>✉️ Email</strong><p style='margin:.4em 0 0'><a href='mailto:hello@example.com' style='color:inherit'>hello@example.com</a></p>"))}`, `background:${c.bg};color:${c.text}`),
    },
    {
      id: "sec-reviews",
      label: "Guest reviews",
      category: "Sections",
      media: icon("⭐"),
      content: wrap(`${h2("What our guests say")}${grid(3, [1, 2, 3].map(() => card(`<p style="font-style:italic;margin:0 0 .8em">“Add a real review from one of your guests.”</p><strong>— Guest name</strong>`)).join(""))}`, `background:${c.bg};color:${c.text}`),
    },
    {
      id: "sec-cta",
      label: "Call-to-action band",
      category: "Sections",
      media: icon("📣"),
      content: `<section style="padding:56px 20px;background:${c.primary};color:${c.on};text-align:center"><div style="max-width:720px;margin:0 auto"><h2 style="font-family:${c.h};margin:0 0 .4em;font-size:2rem">Hungry? Come and see us</h2><p style="margin:0 0 1.2em;opacity:.9">Book a table or order online today.</p><a href="#contact" style="display:inline-block;padding:13px 26px;border-radius:999px;background:${c.on};color:${c.primary};text-decoration:none;font-weight:700">Get in touch</a></div></section>`,
    },
    {
      id: "sec-footer",
      label: "Footer",
      category: "Sections",
      media: icon("🔻"),
      content: `<footer style="padding:32px 20px;border-top:1px solid ${c.line};background:${c.bg};color:${c.text}"><div style="max-width:1120px;margin:0 auto;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap"><span>© Your restaurant</span><span style="color:${c.muted}">Your address</span></div></footer>`,
    },
    // ---- Elements ----
    { id: "el-heading", label: "Heading", category: "Elements", media: icon("🔠"), content: `<h2 style="font-family:${c.h};margin:0 0 .5em;color:${c.text}">A new heading</h2>` },
    { id: "el-text", label: "Paragraph", category: "Elements", media: icon("📝"), content: `<p style="margin:0 0 1em;color:${c.text}">Write something here. Click to edit.</p>` },
    { id: "el-button", label: "Button", category: "Elements", media: icon("🔘"), content: btn("Button") },
    { id: "el-image", label: "Image", category: "Elements", media: icon("🏞️"), content: `<img src="${PLACEHOLDER}" alt="Photo" style="width:100%;max-width:100%;border-radius:12px;display:block">` },
    { id: "el-cols2", label: "2 columns", category: "Elements", media: icon("◫"), content: grid(2, `<div style="color:${c.text}"><p>Left column</p></div><div style="color:${c.text}"><p>Right column</p></div>`) },
    { id: "el-cols3", label: "3 columns", category: "Elements", media: icon("▥"), content: grid(3, [1, 2, 3].map((n) => `<div style="color:${c.text}"><p>Column ${n}</p></div>`).join("")) },
    { id: "el-card", label: "Card", category: "Elements", media: icon("🗂️"), content: card(`<h3 style="font-family:${c.h};margin:0 0 .3em">Card title</h3><p style="margin:0;color:${c.muted}">Card text goes here.</p>`) },
    { id: "el-iconrow", label: "Icon + text", category: "Elements", media: icon("✨"), content: `<div style="display:flex;gap:14px;align-items:flex-start;color:${c.text}"><div style="font-size:28px;line-height:1">🌿</div><div><strong>A good reason</strong><p style="margin:.2em 0 0;color:${c.muted}">One line that explains it.</p></div></div>` },
    { id: "el-quote", label: "Quote", category: "Elements", media: icon("❝"), content: `<blockquote style="margin:0;padding:8px 0 8px 18px;border-left:4px solid ${c.primary};font-style:italic;color:${c.text}">“A short quote worth reading.”</blockquote>` },
    { id: "el-divider", label: "Divider", category: "Elements", media: icon("➖"), content: `<hr style="border:0;border-top:1px solid ${c.line};margin:32px 0">` },
    { id: "el-spacer", label: "Spacer", category: "Elements", media: icon("↕️"), content: `<div style="height:48px"></div>` },
    { id: "el-map", label: "Map link", category: "Elements", media: icon("🗺️"), content: btn("Get directions", "https://www.google.com/maps/search/?api=1&query=Your+address") },
  ];
}
