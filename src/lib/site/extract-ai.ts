import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AnalyseResult, BriefFields } from "./brief";
import { PRODUCTS } from "./products";

// The AI pre-fill for the /build brief, used only once Super Admin has saved an Anthropic API
// key (see lib/platform-settings.ts). Claude reads the description, the menu PDFs/images and the
// logo directly, and answers in a fixed JSON shape — so the review step gets the same fields
// whether this or the pattern-based extract-basic.ts ran.

const BriefSchema = z.object({
  restaurantName: z.string(),
  cuisine: z.string(),
  address: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string(),
  instagram: z.string(),
  openingHours: z.string(),
  about: z.string(),
  colours: z.array(z.string()),
  menuItems: z.array(z.object({ name: z.string(), price: z.string(), category: z.string() })),
  features: z.array(z.enum(PRODUCTS.map((p) => p.slug) as [string, ...string[]])),
});

const SYSTEM = `You pre-fill a website brief for a restaurant, café or takeaway from what its owner sent: a free-text description, and optionally a logo and menu files.

Fill each field only with what the material actually states or shows. Leave a field as an empty string (or an empty list) when it isn't there — the owner reviews every field next, so a blank is far better than a guess.

- restaurantName: the business name as written.
- cuisine: up to three short words, comma-separated (e.g. "Indian, Nepalese").
- address: one line including the postcode.
- openingHours: one line per day or day range, e.g. "Mon–Thu 17:00–22:00".
- about: two or three warm sentences for the website's About section, in the owner's voice, using only facts they gave. No contact details.
- colours: up to five brand colours as #RRGGBB — read them from the logo when there is one, otherwise from colours the owner names.
- menuItems: every dish or drink with a price you can read in the menu files or description; price as a plain number like "9.50"; category is the menu heading it sits under ("" if none).
- features: which of these IQ products the owner says they want: ${PRODUCTS.map((p) => `${p.slug} (${p.name}: ${p.tagline})`).join("; ")}.`;

export interface AiInputFile {
  kind: "logo" | "menu" | "photo";
  mediaType: string;
  // Either a public URL Claude can fetch (Vercel Blob), or the raw bytes.
  url?: string;
  data?: Buffer;
}

type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

function fileBlock(file: AiInputFile): Anthropic.Beta.BetaContentBlockParam | null {
  if (file.mediaType === "application/pdf") {
    return file.url
      ? { type: "document", source: { type: "url", url: file.url }, title: `${file.kind} file` }
      : { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data!.toString("base64") }, title: `${file.kind} file` };
  }
  if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.mediaType)) return null;
  return file.url
    ? { type: "image", source: { type: "url", url: file.url } }
    : { type: "image", source: { type: "base64", media_type: file.mediaType as ImageMediaType, data: file.data!.toString("base64") } };
}

export async function extractWithClaude(apiKey: string, description: string, files: AiInputFile[]): Promise<AnalyseResult> {
  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const file of files) {
    const block = fileBlock(file);
    if (!block) continue;
    content.push({ type: "text", text: file.kind === "logo" ? "The logo:" : file.kind === "menu" ? "A menu file:" : "A photo:" });
    content.push(block);
  }
  content.push({ type: "text", text: `The owner's description:\n\n${description}` });

  const response = await client.beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    // A short, well-defined extraction — low effort keeps it quick for someone waiting on the form.
    output_config: { effort: "low", format: betaZodOutputFormat(BriefSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error(`Claude returned no brief (stop_reason: ${response.stop_reason})`);
  }

  const fields: BriefFields = {
    ...response.parsed_output,
    colours: response.parsed_output.colours.filter((c) => /^#[0-9a-f]{6}$/i.test(c)).map((c) => c.toUpperCase()).slice(0, 5),
    menuItems: response.parsed_output.menuItems.slice(0, 200),
  };
  const found = (Object.keys(fields) as (keyof BriefFields)[]).filter((k) => {
    const v = fields[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  return { fields, found, extractedWith: "ai" };
}

// Super Admin's "Test key" button — the cheapest possible call that proves the key works.
export async function testAnthropicKey(apiKey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 0 });
    await client.models.retrieve("claude-opus-5-5");
    return { ok: true };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "Anthropic rejected this key." };
    if (error instanceof Anthropic.PermissionDeniedError) return { ok: false, error: "This key isn't allowed to use Claude Opus 5.5." };
    if (error instanceof Anthropic.APIError) return { ok: false, error: `Anthropic returned an error (${error.status}).` };
    return { ok: false, error: "Couldn't reach Anthropic." };
  }
}
