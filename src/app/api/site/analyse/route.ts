import { NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { getAnthropicApiKey } from "@/lib/platform-settings";
import { isBlobUrl, MAX_DESCRIPTION, MAX_INLINE_BYTES, UPLOAD_TYPES, type AnalyseResult } from "@/lib/site/brief";
import { extractWithClaude, type AiInputFile } from "@/lib/site/extract-ai";
import { extractBasic } from "@/lib/site/extract-basic";
import { allowRequest } from "@/lib/site/rate-limit";

// Step 2 of /build: turn the description + uploaded files into pre-filled form fields. With an
// Anthropic key saved in Super Admin, Claude reads everything (including the menu PDFs and the
// logo); otherwise — or if that call fails — pattern matching runs over the description and the
// menu PDFs' text. Nothing is stored here; the sender reviews the result and submits separately.
export const maxDuration = 120;

interface FileMeta {
  kind: "logo" | "menu" | "photo";
  url: string;
  type: string;
}

async function pdfText(file: AiInputFile) {
  try {
    const bytes = file.data ?? Buffer.from(await (await fetch(file.url!)).arrayBuffer());
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  } catch (error) {
    console.error("[site/analyse] couldn't read a menu PDF", error);
    return "";
  }
}

export async function POST(request: Request) {
  if (!(await allowRequest("site-analyse", 12, 10 * 60 * 1000))) {
    return NextResponse.json({ error: "Too many tries — wait a few minutes and try again." }, { status: 429 });
  }

  const form = await request.formData();
  const description = String(form.get("description") ?? "").trim().slice(0, MAX_DESCRIPTION);
  if (description.length < 10) {
    return NextResponse.json({ error: "Tell us a little about your restaurant first." }, { status: 400 });
  }

  const files: AiInputFile[] = [];
  let meta: FileMeta[] = [];
  try {
    meta = JSON.parse(String(form.get("files") ?? "[]"));
  } catch {
    meta = [];
  }
  for (const f of meta.slice(0, 12)) {
    if (isBlobUrl(f.url) && UPLOAD_TYPES.includes(f.type)) files.push({ kind: f.kind, mediaType: f.type, url: f.url });
  }
  // No Blob storage: the files came inline in this request instead.
  let inlineBytes = 0;
  for (const [key, value] of form.entries()) {
    if (!key.startsWith("inline:") || typeof value === "string") continue;
    inlineBytes += value.size;
    if (inlineBytes > MAX_INLINE_BYTES + 256 * 1024 || !UPLOAD_TYPES.includes(value.type)) continue;
    const kind = key.slice("inline:".length) as AiInputFile["kind"];
    files.push({ kind, mediaType: value.type, data: Buffer.from(await value.arrayBuffer()) });
  }

  let logoColours: string[] = [];
  try {
    logoColours = (JSON.parse(String(form.get("logoColours") ?? "[]")) as unknown[])
      .filter((c): c is string => typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c))
      .slice(0, 5);
  } catch {
    logoColours = [];
  }

  let result: AnalyseResult | null = null;
  let apiKey: string | null = null;
  try {
    apiKey = await getAnthropicApiKey();
  } catch (error) {
    console.error("[site/analyse] couldn't read the AI key setting", error);
  }
  if (apiKey) {
    try {
      result = await extractWithClaude(apiKey, description, files);
    } catch (error) {
      console.error("[site/analyse] AI extraction failed, falling back to basic", error);
    }
  }
  if (!result) {
    const menuTexts = await Promise.all(files.filter((f) => f.kind === "menu" && f.mediaType === "application/pdf").map(pdfText));
    result = extractBasic(description, menuTexts.join("\n"));
  }

  if (result.fields.colours.length === 0 && logoColours.length > 0) {
    result.fields.colours = logoColours;
    result.found.push("colours");
  }
  return NextResponse.json(result);
}
