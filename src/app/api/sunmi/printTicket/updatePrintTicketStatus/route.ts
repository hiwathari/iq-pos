import { NextRequest, NextResponse } from "next/server";
import { verifySunmiSignature } from "@/lib/sunmi-print";
import { updateSunmiJobStatus } from "@/lib/data/sunmi-print";

// Called by the printer once it's actually attempted the print — the only place
// sunmi_print_jobs.status moves to its final "printed"/"failed" state. Per Sunmi's spec `status`
// is 1 (printed), 0 (print failed), -1 (bad ticket JSON) or -2 (empty content) — anything other
// than "1" is recorded as "failed" here; failureReason isn't broken out further since Sunmi's own
// codes don't map to free text.
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  if (!verifySunmiSignature(params)) {
    return NextResponse.json({ code: -1, data: null, msg: "invalid signature" });
  }

  const jobId = params.orderId;
  if (!jobId) {
    return NextResponse.json({ code: -1, data: null, msg: "missing orderId" });
  }

  await updateSunmiJobStatus(jobId, params.status === "1" ? "printed" : "failed");
  return NextResponse.json({ code: 1, data: "success", msg: "" });
}
