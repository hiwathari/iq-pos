import "server-only";

// Uses the WebCrypto global (available in both Node and edge runtimes) rather than
// node:crypto's randomInt, so this stays edge-safe if ever imported from there.
export function generatePin(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = new DataView(bytes.buffer).getUint32(0) % 1_000_000;
  return String(num).padStart(6, "0");
}
