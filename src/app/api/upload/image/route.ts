import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

// Short-lived client tokens for the icon / photo pickers inside the app (categories, floors and
// product photos): a signed-in login, images only, a few MB at most, and only under app-icons/.
// (The public website builder has its own route, /api/site/upload.)
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in again to upload photos." }, { status: 401 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Photo uploads aren't set up on this server yet." }, { status: 503 });
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("app-icons/")) throw new Error("Invalid upload path.");
        return {
          allowedContentTypes: ["image/png", "image/jpeg", "image/webp"],
          maximumSizeInBytes: 4 * 1024 * 1024,
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
