import "server-only";
import { createHash } from "node:crypto";

// Thin client for Sunmi's Cloud Print partner API — a very different shape from SumUp/Teya's
// plain REST calls (see lib/sumup.ts / lib/teya.ts). Sunmi's relay is "pull, not push": we tell
// Sunmi's cloud a given printer has a new job (notifySunmiNewOrder below), and the printer itself
// then calls back into OUR OWN API (src/app/api/sunmi/printTicket/*) to fetch the job content and
// report whether it printed. verifySunmiSignature below authenticates those incoming calls.
//
// Source: Sunmi's "Cloud Printer Partner Integration Guide" PDF (no public REST doc page was
// found — Sunmi's public developer portal only documents the on-device/Bluetooth-config SDK).
// Full write-up of the flow: docs/DEVELOPER_GUIDE.md §8.3.
//
// Credentials (SUNMI_CLOUD_PRINT_APP_ID/APP_KEY below) are issued once, platform-wide, after
// registering as a partner at https://partner.sunmi.com/ and requesting Cloud Print channel
// access — same "one pair, shared across every restaurant" shape as SUMUP_AFFILIATE_APP_ID/KEY in
// lib/sumup.ts, not a per-restaurant credential. `shop_id` in Sunmi's API (which merchant/store a
// printer belongs to under our partner account) is just our own restaurant id — nothing to look
// up, we assign it ourselves.
//
// ⚠️ UNVERIFIED: this has not been tested against Sunmi's sandbox (no app_id/app_key issued yet
// at the time this was written). Before trusting it in production: confirm the exact base path
// Sunmi expects for OUR callback URLs when registering the channel (their doc shows the callback
// interface names as "printTicket/getPrintTicketOrderId" etc. with no leading path shown — this
// app hosts them at /api/sunmi/printTicket/... and that's what should be registered, but get
// Sunmi's partner support to confirm), and run one bind + one test print against
// https://uat.openapi.sunmi.com/ first.
const SUNMI_API_BASE = process.env.SUNMI_CLOUD_PRINT_BASE_URL || "https://openapi.sunmi.com";

export class SunmiPrintApiError extends Error {
  constructor(message: string, public code: string, public body: unknown) {
    super(message);
    this.name = "SunmiPrintApiError";
  }
}

// Sunmi's documented signing scheme: sort every param (excluding `sign` itself) by key in ASCII
// order into "k=v&k=v...", append the raw app_key, then MD5 the whole string. Used both to sign
// our own outgoing calls and — with the same function — to verify incoming calls from the
// printer, since it's the identical algorithm in both directions.
function signParams(params: Record<string, string | undefined>, appKey: string): string {
  const stringA = Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("md5").update(stringA + appKey).digest("hex");
}

// Authenticates a request arriving at one of our /api/sunmi/printTicket/* callback routes —
// every such request carries the same sign/app_id/timestamp shape our own outgoing calls do.
// Fails closed (returns false) if SUNMI_CLOUD_PRINT_APP_KEY isn't configured yet.
export function verifySunmiSignature(params: Record<string, string>): boolean {
  const appKey = process.env.SUNMI_CLOUD_PRINT_APP_KEY;
  const sign = params.sign;
  if (!appKey || !sign) return false;
  return signParams(params, appKey) === sign;
}

async function callSunmiApi<T>(path: string, privateParams: Record<string, string>): Promise<T> {
  const appId = process.env.SUNMI_CLOUD_PRINT_APP_ID;
  const appKey = process.env.SUNMI_CLOUD_PRINT_APP_KEY;
  if (!appId || !appKey) {
    throw new SunmiPrintApiError(
      "Sunmi Cloud Print isn't configured yet — set SUNMI_CLOUD_PRINT_APP_ID/SUNMI_CLOUD_PRINT_APP_KEY once Sunmi issues them.",
      "no_credentials",
      null
    );
  }
  const params: Record<string, string> = {
    app_id: appId,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    ...privateParams,
  };
  const sign = signParams(params, appKey);
  const body = new URLSearchParams({ ...params, sign });

  const res = await fetch(`${SUNMI_API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  // Sunmi's documented success code is "10000" (string) — guarding both string/number just in
  // case, since the sample payloads in their doc aren't fully consistent about quoting it.
  if (!json || (json.code !== "10000" && json.code !== 10000)) {
    throw new SunmiPrintApiError(json?.msg || `Sunmi ${path} failed`, String(json?.code ?? "unknown"), json);
  }
  return json.data as T;
}

// Binds a printer's SN to this restaurant under our partner account — call once when an admin
// saves a printer's Sunmi SN in Settings.
export async function bindSunmiPrinter(msn: string, shopId: string): Promise<void> {
  await callSunmiApi("/v1/printer/printerAdd", { msn, shop_id: shopId });
}

export async function unbindSunmiPrinter(msn: string, shopId: string): Promise<void> {
  await callSunmiApi("/v1/printer/printerUnBind", { msn, shop_id: shopId });
}

export interface SunmiBoundDevice {
  msn: string;
  is_online: "0" | "1";
}

export async function queryBoundSunmiPrinters(shopId: string): Promise<SunmiBoundDevice[]> {
  return callSunmiApi("/v1/machine/queryBindMachine", { shop_id: shopId });
}

// Tells Sunmi's cloud that `jobId` (a sunmi_print_jobs row id) is ready for printer `msn` to pick
// up — this is what wakes the physical printer, which then calls back into our own
// /api/sunmi/printTicket/* routes to actually fetch and print it. This call itself only confirms
// Sunmi accepted the notification, not that printing happened — see sunmi_print_jobs.status for
// the eventual real outcome, reported by the printer's own callback.
export async function notifySunmiNewOrder(msn: string, jobId: string): Promise<void> {
  await callSunmiApi("/v1/printer/newOrderNotice", { msn, hasOrder: "1", orderId: jobId });
}
