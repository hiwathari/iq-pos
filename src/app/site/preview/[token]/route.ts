import { NextResponse, type NextRequest } from "next/server";
import { getProject } from "@/lib/site/projects";
import { documentFor } from "@/lib/site/sanitize";

// The generated site as a standalone page, shown inside an iframe in the studio. Served under a strict
// Content-Security-Policy — no scripts at all, images only over https/data, fonts only from Google — so even
// if something odd slipped past the sanitiser it can't run code.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const project = await getProject(token);
  if (!project?.html) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(documentFor(project.name, project.html, project.css ?? ""), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy":
        "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
