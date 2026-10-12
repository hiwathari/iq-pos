import { NextRequest, NextResponse } from "next/server";
import { verifySunmiSignature } from "@/lib/sunmi-print";
import { getSunmiJobContent } from "@/lib/data/sunmi-print";

// Called by the printer after getPrintTicketOrderId hands it a job id — returns the actual ticket
// content to print. `data` is the hex-encoded raw ESC/POS command bytes built by
// lib/escpos-ticket.ts, handed back verbatim exactly as Sunmi's spec requires. Allowed to return
// content for a job that's already "printed" (Sunmi's cloud printer supports re-printing from its
// own device menu, which re-requests this same endpoint), so this never gates on status.
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  if (!verifySunmiSignature(params)) {
    return NextResponse.json({ code: -1, data: null, msg: "invalid signature" });
  }

  const jobId = params.orderId;
  const job = jobId ? await getSunmiJobContent(jobId) : null;
  if (!job) {
    return NextResponse.json({ code: -1, data: null, msg: "unknown order id" });
  }

  return NextResponse.json({ code: 1, data: { voice: job.voiceText ?? "", data: job.escposHex }, msg: "" });
}
