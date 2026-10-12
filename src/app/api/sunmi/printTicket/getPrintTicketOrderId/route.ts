import { NextRequest, NextResponse } from "next/server";
import { verifySunmiSignature } from "@/lib/sunmi-print";
import { findPrinterBySunmiSn, pendingJobIdsForPrinter } from "@/lib/data/sunmi-print";

// Called directly by the Sunmi printer itself (not by our own app) — see
// docs/DEVELOPER_GUIDE.md §8.3. The printer polls this on its own schedule; we hand back up to 5
// pending job ids for its own SN, oldest first, and it's expected to keep polling until this
// comes back empty. Response shape (code/data/msg) matches Sunmi's documented contract exactly —
// this is not our app's usual JSON error shape.
export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams);
  if (!verifySunmiSignature(params)) {
    return NextResponse.json({ code: -1, data: null, msg: "invalid signature" });
  }

  const msn = params.msn;
  const printer = msn ? await findPrinterBySunmiSn(msn) : null;
  if (!printer) {
    return NextResponse.json({ code: -1, data: null, msg: "unknown printer sn" });
  }

  const ids = await pendingJobIdsForPrinter(printer.id);
  return NextResponse.json({ code: 1, data: ids, msg: "" });
}
