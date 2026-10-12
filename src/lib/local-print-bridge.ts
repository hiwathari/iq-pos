// Client-side only (no "server-only" import) — the browser itself can't open a raw TCP socket to
// a printer, so printing goes through one of two bridges depending on where the page is running:
//
// 1. The IQ POS Till APK (android-app/ — see docs/DEVELOPER_GUIDE.md §7.9) injects a native
//    `window.AndroidPrintBridge.print(ip, port, hex)` method into every page it loads. When
//    present, this calls it directly — no HTTP hop, no port, no Private Network Access
//    preflight, since it's a same-process native call, not a network request.
// 2. Everywhere else (a plain browser, no APK), this falls back to the standalone
//    scripts/local-print-bridge.js program over HTTP, which must be running on the same device
//    (loopback) — see docs/DEVELOPER_GUIDE.md §7.8.
//
// ⚠️ Browsers' Private Network Access rules can restrict an HTTPS page calling an HTTP localhost
// endpoint via the fallback path, and behavior differs by browser/version — if that path silently
// fails, check the browser console for a blocked/mixed-content warning first.
const DEFAULT_BRIDGE_URL = "http://127.0.0.1:9200/print";

interface AndroidPrintBridge {
  print(printerIp: string, printerPort: number, escposHex: string): void;
}

declare global {
  interface Window {
    AndroidPrintBridge?: AndroidPrintBridge;
  }
}

export async function printViaLocalBridge(input: {
  printerIp: string;
  printerPort?: number | null;
  escposHex: string;
  bridgeUrl?: string;
}): Promise<void> {
  const port = input.printerPort || 9100;

  if (typeof window !== "undefined" && window.AndroidPrintBridge) {
    // Fire-and-forget, same as the native side's own contract — it has no way to report success
    // back synchronously, and the HTTP path below is equally best-effort.
    window.AndroidPrintBridge.print(input.printerIp, port, input.escposHex);
    return;
  }

  const res = await fetch(input.bridgeUrl || DEFAULT_BRIDGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printerIp: input.printerIp, printerPort: port, escposHex: input.escposHex }),
  });
  if (!res.ok) {
    throw new Error(`Local print bridge responded ${res.status}`);
  }
}
