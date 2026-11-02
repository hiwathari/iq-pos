"use client";

// Counter scales (docs/retail-plan step 3.10) via Web Serial — Chrome / Edge on a computer with
// the scale on a USB or serial port. Scales stream their weight as text; protocols differ by
// brand, so this reads the latest line and takes the first number with an optional kg/g unit,
// which covers the common "continuous output" modes (e.g. "ST,GS,+  0.734kg", "W 734 g").
// Chosen once per till in Settings → Scale (remembered in this browser). Only a trade-approved
// scale may be used to price goods sold by weight.

const KEY = "iq-scale";

type SerialPortLike = {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo?: () => { usbVendorId?: number; usbProductId?: number };
};
type SerialLike = { requestPort(): Promise<SerialPortLike>; getPorts(): Promise<SerialPortLike[]> };

function serial(): SerialLike | null {
  return typeof navigator !== "undefined" && "serial" in navigator ? ((navigator as unknown as { serial: SerialLike }).serial ?? null) : null;
}

export function scaleSupported() {
  return !!serial();
}

export function scaleConfigured() {
  try {
    return !!serial() && !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}

export interface ScaleSettings {
  baudRate: number;
  // Some scales only send a weight when asked; this is sent first if set (e.g. "W\r").
  request?: string;
}

export function loadScaleSettings(): ScaleSettings | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ScaleSettings) : null;
  } catch {
    return null;
  }
}

// Asks the browser for the port (the person picks it) and remembers the settings.
export async function connectScale(settings: ScaleSettings): Promise<{ ok: true } | { error: string }> {
  const s = serial();
  if (!s) return { error: "This browser can't talk to a scale — use Chrome or Edge on a computer." };
  try {
    await s.requestPort();
    localStorage.setItem(KEY, JSON.stringify(settings));
    return { ok: true };
  } catch {
    return { error: "No scale chosen." };
  }
}

export function forgetScale() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// Pull one weight in kg out of a line of scale output; null if there's no number in it.
export function parseScaleLine(line: string): { kg: number; stable: boolean } | null {
  const m = line.match(/([-+]?\s*\d+(?:[.,]\d+)?)\s*(kg|g|lb)?/i);
  if (!m) return null;
  let value = Number(m[1].replace(/\s/g, "").replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] ?? "kg").toLowerCase();
  if (unit === "g") value /= 1000;
  if (unit === "lb") value *= 0.45359237;
  // Many scales mark an unsettled reading with "US" (unstable) or "M" (motion).
  const stable = !/\b(US|M)\b|unstable|motion/i.test(line);
  return { kg: Math.round(value * 1000) / 1000, stable };
}

export async function readScaleWeight(timeoutMs = 2500): Promise<{ kg: number; stable: boolean } | { error: string }> {
  const s = serial();
  const settings = loadScaleSettings();
  if (!s || !settings) return { error: "No scale set up on this till." };
  const [port] = await s.getPorts();
  if (!port) return { error: "The scale isn't connected — check the cable, then set it up again in Settings." };
  try {
    await port.open({ baudRate: settings.baudRate });
  } catch {
    // Already open from an earlier read — carry on.
  }
  try {
    if (settings.request && port.writable) {
      const w = port.writable.getWriter();
      await w.write(new TextEncoder().encode(settings.request.replace(/\\r/g, "\r").replace(/\\n/g, "\n")));
      w.releaseLock();
    }
    if (!port.readable) return { error: "The scale isn't sending anything." };
    const reader = port.readable.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let best: { kg: number; stable: boolean } | null = null;
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline) {
        const chunk = await Promise.race([reader.read(), new Promise<null>((r) => setTimeout(() => r(null), deadline - Date.now()))]);
        if (!chunk || chunk.done) break;
        text += decoder.decode(chunk.value, { stream: true });
        const lines = text.split(/\r?\n|\r/);
        text = lines.pop() ?? "";
        for (const line of lines) {
          const read = parseScaleLine(line);
          if (read) best = read;
          if (read?.stable) return read;
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return best ?? { error: "No weight came from the scale." };
  } catch {
    return { error: "Couldn't read the scale." };
  }
}
