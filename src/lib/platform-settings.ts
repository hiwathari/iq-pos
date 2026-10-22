import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { platformSettings } from "@/db/schema";

// Keys for the platform_settings table. Anything secret is stored encrypted (AES-256-GCM) with a
// key derived from JWT_SECRET, so a leaked database dump alone doesn't hand out the API key —
// it'd also need the app's environment.
export const SETTING_ANTHROPIC_KEY = "anthropic_api_key";

function encryptionKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET. Set it in .env.local (see .env.example).");
  return createHash("sha256").update(`platform-settings:v1:${secret}`).digest();
}

function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

function decrypt(stored: string): string | null {
  const [version, iv, tag, data] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    // JWT_SECRET was rotated since the key was saved — treat it as not set.
    return null;
  }
}

async function readSetting(key: string) {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, key)).limit(1);
  return row ?? null;
}

export async function getAnthropicApiKey(): Promise<string | null> {
  const row = await readSetting(SETTING_ANTHROPIC_KEY);
  return row ? decrypt(row.value) : null;
}

// What Super Admin sees — never the key itself, only its last four characters.
export async function getAnthropicKeyStatus(): Promise<{ configured: boolean; last4: string | null; updatedAt: number | null }> {
  const row = await readSetting(SETTING_ANTHROPIC_KEY);
  const key = row ? decrypt(row.value) : null;
  return { configured: !!key, last4: key ? key.slice(-4) : null, updatedAt: key ? row!.updatedAt : null };
}

export async function saveAnthropicApiKey(key: string | null) {
  if (!key) {
    await db.delete(platformSettings).where(eq(platformSettings.key, SETTING_ANTHROPIC_KEY));
    return;
  }
  const value = encrypt(key);
  const updatedAt = Date.now();
  await db
    .insert(platformSettings)
    .values({ key: SETTING_ANTHROPIC_KEY, value, updatedAt })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt } });
}
