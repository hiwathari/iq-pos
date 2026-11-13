import { esc } from "./kit";
import { EMBER, renderEmber } from "./ember";
import { FRESH, renderFresh } from "./fresh";
import { NOIR, renderNoir } from "./noir";
import type { Design, SiteData, TemplateId, TemplateInfo } from "./types";

export * from "./types";

export const TEMPLATES: TemplateInfo[] = [NOIR, EMBER, FRESH];

export const templateInfo = (id: string): TemplateInfo => TEMPLATES.find((t) => t.id === id) ?? NOIR;

export function render(data: SiteData, design: Design): { html: string; css: string } {
  switch (design.template) {
    case "ember":
      return renderEmber(data, design);
    case "fresh":
      return renderFresh(data, design);
    default:
      return renderNoir(data, design);
  }
}

/** A full HTML document for live previews in the studio (scripts are never present in a design). */
export function previewDocument(data: SiteData, design: Design): string {
  const { html, css } = render(data, design);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(data.name)}</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0}img{max-width:100%}${css}</style></head><body>${html}</body></html>`;
}

export function defaultDesign(id: TemplateId | string): Design {
  return { ...templateInfo(id).defaults };
}
