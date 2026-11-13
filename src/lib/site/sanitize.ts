import sanitizeHtml from "sanitize-html";

// Everything the AI writes — and everything a customer saves from the editor — passes through here before it
// is stored or served. The preview is also served under a strict Content-Security-Policy (see
// app/site/preview/[token]/route.ts), so this is the second layer, not the only one.

const TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  "img", "picture", "source", "section", "header", "footer", "nav", "main", "article", "aside", "figure", "figcaption",
  "h1", "h2", "h3", "h4", "h5", "h6", "span", "small", "mark", "address", "time", "button", "details", "summary",
];

export function cleanHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: TAGS,
    allowedAttributes: {
      "*": ["class", "id", "style", "title", "role", "lang", "aria-*", "data-*"],
      a: ["href", "target", "rel", "name"],
      img: ["src", "srcset", "sizes", "alt", "width", "height", "loading"],
      source: ["src", "srcset", "sizes", "type", "media"],
      time: ["datetime"],
      button: ["type"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"], source: ["http", "https"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tag, attribs) => ({
        tagName: tag,
        attribs: attribs.target === "_blank" ? { ...attribs, rel: "noopener noreferrer" } : attribs,
      }),
    },
  });
}

export function cleanCss(css: string): string {
  return css
    .replace(/<\/?style[^>]*>/gi, "")
    // Only Google Fonts may be imported; every other @import is dropped.
    .replace(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;?/gi, (m, url: string) => (/^https:\/\/fonts\.googleapis\.com\//i.test(url) ? m : ""))
    .replace(/expression\s*\(/gi, "(")
    .replace(/javascript\s*:/gi, "")
    .replace(/behaviou?r\s*:[^;}]*/gi, "")
    .replace(/-moz-binding\s*:[^;}]*/gi, "");
}

export function documentFor(title: string, html: string, css: string): string {
  const safeTitle = title.replace(/[<>&"]/g, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${safeTitle}</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}img{max-width:100%}${css}</style></head><body>${html}</body></html>`;
}
