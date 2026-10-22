import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";

// Best-effort, per-server-instance limit for the public /build endpoints (uploads and the
// analyse step, which may call a paid AI API). It resets when an instance is recycled, so it
// only blunts a script hammering one instance — the submit step has its own database-backed
// limit for anything that's actually stored.
const hits = new Map<string, number[]>();

export async function clientIpHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`iq-site:${ip}`).digest("hex").slice(0, 32);
}

export async function allowRequest(bucket: string, limit: number, windowMs: number) {
  const key = `${bucket}:${await clientIpHash()}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}
