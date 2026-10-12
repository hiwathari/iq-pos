// Client-side only (no "server-only" import) — the browser itself can't open a raw TCP socket to
// a printer, so this calls a small local bridge program instead (see scripts/local-print-bridge.js
// and docs/DEVELOPER_GUIDE.md §7.7 for what that is and how to run it). Defaults to localhost,
// which is the recommended setup: the bridge runs on the same device as the Till's own browser
// (e.g. via Termux on an Android Till), so this is a loopback call, not a cross-device one.
//
// ⚠️ Browsers' Private Network Access rules can restrict an HTTPS page calling an HTTP localhost
// endpoint, and behavior differs by browser/version — if this silently fails, check the browser
// console for a blocked/mixed-content warning first.
const DEFAULT_BRIDGE_URL = "http://127.0.0.1:9200/print";

export async function printViaLocalBridge(input: {
  printerIp: string;
  printerPort?: number | null;
  escposHex: string;
  bridgeUrl?: string;
}): Promise<void> {
  const res = await fetch(input.bridgeUrl || DEFAULT_BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      printerIp: input.printerIp,
      printerPort: input.printerPort || 9100,
      escposHex: input.escposHex,
    }),
  });
  if (!res.ok) {
    throw new Error(`Local print bridge responded ${res.status}`);
  }
}
