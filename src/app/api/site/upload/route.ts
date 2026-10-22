import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES, UPLOAD_TYPES } from "@/lib/site/brief";
import { allowRequest } from "@/lib/site/rate-limit";

// Issues short-lived client tokens so the /build page can upload a logo, menus and photos
// straight to Vercel Blob (bypassing the ~4.5 MB request limit on our own functions). Only
// images and PDFs, only under website-requests/, and only a handful per visitor per hour.
export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Uploads aren't set up yet." }, { status: 503 });
  }
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("website-requests/")) throw new Error("Invalid upload path.");
        if (!(await allowRequest("site-upload", 30, 60 * 60 * 1000))) throw new Error("Too many uploads — try again later.");
        return {
          allowedContentTypes: UPLOAD_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Upload failed." }, { status: 400 });
  }
}
