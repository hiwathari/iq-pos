import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  getPlainSetting,
  getSecretSetting,
  getAnthropicApiKey,
  SETTING_GEMINI_KEY,
  SETTING_GEMINI_MODEL,
  SETTING_SITE_ENGINE,
  SETTING_SITE_PROMPT,
} from "@/lib/platform-settings";
import { cleanCss, cleanHtml } from "./sanitize";

// Turns a customer's brief into a one-page website (HTML + CSS, the pair GrapesJS edits), or applies one
// requested change to an existing site. Engine: Claude when an Anthropic key is saved in Super Admin and
// the engine setting allows it, otherwise Gemini Flash. GEMINI_API_BASE exists only for tests.

export const DEFAULT_GEMINI_MODEL = "gemini-flash-latest";
const CLAUDE_MODEL = "claude-sonnet-5-5";

export type Engine = "gemini" | "claude";
export interface SiteDraft {
  html: string;
  css: string;
  engine: Engine;
}

const SYSTEM = `You are a senior web designer building a ready-to-publish one-page website for a small restaurant, café, takeaway or shop owner who is not technical. The site will be opened in a visual editor (GrapesJS) so the owner can change text and pictures by clicking on them: write clean, simple, well-structured markup.

OUTPUT FORMAT — reply with exactly this and nothing else (no commentary, no markdown fences):
<<<HTML
(the contents of <body> only — no <html>, <head>, <body>, <script>, <style>, <iframe> or <form> tags)
<<<CSS
(one stylesheet for everything above)
<<<END

DESIGN RULES
- Fully responsive, mobile-first. It must look polished on a phone first, then tablet and desktop.
- One page with anchor sections in a sensible order: a sticky top navigation (business name or logo + links to the sections), a strong hero, then the sections the owner asked for (menu, about, gallery, contact & opening hours, etc.), and a footer.
- Use semantic tags (header, nav, main, section, h1–h3, footer), real headings in order, and alt text on every image.
- Typography: pick one Google Fonts pair that suits the style asked for and import it with a single @import url('https://fonts.googleapis.com/...') at the top of the CSS. Generous spacing, a clear type scale, strong contrast (WCAG AA).
- Colours: use the brand colours given, as CSS custom properties on :root. If none are given, choose a tasteful palette that suits the cuisine and style.
- Use only the images supplied (as absolute https URLs). Never invent image URLs. With no photos, build a confident typographic design with colour blocks and emoji or CSS shapes — never stock-photo placeholders or lorem ipsum.
- No JavaScript, no forms, no external scripts. Buttons are links: telephone (tel:), email (mailto:), directions (a Google Maps search link built from the address), or an in-page anchor.
- The menu section lists every dish given, grouped by its category, with prices exactly as given (add the £ sign if a bare number is given). Do not invent dishes or prices.

HONESTY RULES
- Use only facts the brief states. Never invent awards, reviews, years in business, staff names, addresses, opening hours or phone numbers. If something is missing, leave that detail out rather than guess.
- Write warm, specific copy in the owner's voice, British English, no filler.`;

const REVISE_SYSTEM = `You are a senior web designer changing an existing one-page website for a restaurant, café or shop owner. You are given the current HTML (the contents of <body>) and CSS, and ONE change request. Apply exactly that change and keep everything else as it is — same structure, text, images and styling unless the request says otherwise. Keep the result responsive, accessible and free of scripts, forms and iframes. Never invent facts (prices, hours, addresses, reviews) the owner did not give.

OUTPUT FORMAT — reply with the complete updated site and nothing else (no commentary, no markdown fences):
<<<HTML
(the full updated <body> contents)
<<<CSS
(the full updated stylesheet)
<<<END`;

interface Brief {
  fields?: Record<string, unknown>;
  answers?: Record<string, unknown>;
  files?: { kind: string; name: string; url: string | null }[];
  description?: string;
}

function lines(label: string, value: unknown): string {
  if (Array.isArray(value)) return value.length ? `${label}: ${value.join(", ")}\n` : "";
  return typeof value === "string" && value.trim() ? `${label}: ${value.trim()}\n` : "";
}

export function briefToPrompt(brief: Brief): string {
  const f = (brief.fields ?? {}) as Record<string, unknown>;
  const a = (brief.answers ?? {}) as Record<string, unknown>;
  let out = "THE BUSINESS\n";
  out += lines("Name", f.restaurantName) + lines("Cuisine / type", f.cuisine) + lines("Address", f.address) + lines("Phone", f.phone);
  out += lines("Email", f.email) + lines("Instagram", f.instagram) + lines("Opening hours", f.openingHours) + lines("About (owner's words)", f.about);
  out += "\nWHAT THE OWNER WANTS\n";
  out += lines("Style", a.style) + lines("Sections/pages", a.pages) + lines("Brand colours", f.colours) + lines("Extra notes", a.notes);
  const items = Array.isArray(f.menuItems) ? (f.menuItems as { name?: string; price?: string; category?: string }[]) : [];
  if (items.length) {
    out += "\nMENU (category | dish | price)\n" + items.map((m) => `${m.category || "Menu"} | ${m.name} | ${m.price || ""}`).join("\n") + "\n";
  }
  const images = (brief.files ?? []).filter((x) => x.url && (x.kind === "logo" || x.kind === "photo"));
  if (images.length) {
    out += "\nIMAGES YOU MAY USE (absolute URLs)\n" + images.map((x) => `${x.kind}: ${x.url}`).join("\n") + "\n";
  } else {
    out += "\nNo images were supplied.\n";
  }
  if (typeof brief.description === "string" && brief.description.trim()) out += `\nTHE OWNER'S OWN DESCRIPTION\n${brief.description.trim()}\n`;
  return out;
}

export function parseDraft(text: string): { html: string; css: string } {
  const m = text.match(/<<<HTML\s*([\s\S]*?)\s*<<<CSS\s*([\s\S]*?)\s*(?:<<<END|$)/);
  if (!m) throw new Error("The AI didn't return a site in the expected format.");
  const html = cleanHtml(m[1].replace(/^```\w*\s*|```\s*$/g, "").trim());
  const css = cleanCss(m[2].replace(/^```\w*\s*|```\s*$/g, "").trim());
  if (html.length < 200) throw new Error("The AI returned an almost empty page.");
  return { html, css };
}

async function callGemini(system: string, user: string): Promise<string> {
  const key = await getSecretSetting(SETTING_GEMINI_KEY);
  if (!key) throw new Error("No Gemini key is saved in Super Admin.");
  const model = ((await getPlainSetting(SETTING_GEMINI_MODEL)) || DEFAULT_GEMINI_MODEL).replace(/^models\//, "");
  const base = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com";
  const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 32768 },
    }),
    signal: AbortSignal.timeout(240_000),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
  };
  if (!res.ok) throw new Error(`Gemini: ${json?.error?.message || `error ${res.status}`}`);
  const cand = json.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  if (!text) throw new Error(`Gemini returned nothing (${cand?.finishReason ?? "no candidate"}).`);
  if (cand?.finishReason === "MAX_TOKENS") throw new Error("The page was too long for the AI to finish — try a shorter brief.");
  return text;
}

async function callClaude(apiKey: string, system: string, user: string): Promise<string> {
  const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 1 });
  const message = await client.messages.stream({ model: CLAUDE_MODEL, max_tokens: 32000, system, messages: [{ role: "user", content: user }] }).finalMessage();
  if (message.stop_reason === "max_tokens") throw new Error("The page was too long for the AI to finish — try a shorter brief.");
  return message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

/** Which engine will run: Claude only when a key is saved and the setting isn't forced to Gemini. */
export async function pickEngine(): Promise<Engine> {
  const setting = (await getPlainSetting(SETTING_SITE_ENGINE)) || "auto";
  const claudeKey = await getAnthropicApiKey().catch(() => null);
  if (setting === "gemini") return "gemini";
  if (setting === "claude") return claudeKey ? "claude" : "gemini";
  return claudeKey ? "claude" : "gemini";
}

async function run(system: string, user: string): Promise<SiteDraft> {
  const extra = ((await getPlainSetting(SETTING_SITE_PROMPT)) || "").trim();
  const fullSystem = extra ? `${system}\n\nADDITIONAL HOUSE RULES FROM THE PLATFORM OWNER (follow these too)\n${extra}` : system;
  const engine = await pickEngine();
  const text = engine === "claude" ? await callClaude((await getAnthropicApiKey())!, fullSystem, user) : await callGemini(fullSystem, user);
  return { ...parseDraft(text), engine };
}

export function generateSite(brief: Brief): Promise<SiteDraft> {
  return run(SYSTEM, `Build the website for this business.\n\n${briefToPrompt(brief)}`);
}

export function reviseSite(brief: Brief, current: { html: string; css: string }, instruction: string): Promise<SiteDraft> {
  return run(
    REVISE_SYSTEM,
    `BUSINESS FACTS (for reference)\n${briefToPrompt(brief)}\n\nCURRENT HTML\n${current.html}\n\nCURRENT CSS\n${current.css}\n\nTHE CHANGE REQUESTED\n${instruction}`
  );
}

export async function testGeminiKey(key: string, model: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com";
  try {
    const res = await fetch(`${base}/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ""))}`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(20_000) });
    if (res.ok) return { ok: true };
    if (res.status === 400 || res.status === 403) return { ok: false, error: "Google rejected this key." };
    if (res.status === 404) return { ok: false, error: `Google doesn't know a model called "${model}".` };
    return { ok: false, error: `Google returned an error (${res.status}).` };
  } catch {
    return { ok: false, error: "Couldn't reach Google." };
  }
}
