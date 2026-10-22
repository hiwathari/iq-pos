import "server-only";
import { headers } from "next/headers";

// On iq.luvder.com the proxy serves this site from the root ("/build" → /site/build), so links
// are plain "/build". Anywhere else (pos.luvder.com/site, a *.vercel.app preview) the pages are
// reached at /site/..., so links need that prefix to keep working.
export async function getSiteBase() {
  const host = ((await headers()).get("host") ?? "").split(":")[0].toLowerCase();
  return host === "iq.luvder.com" || host === "iq.localhost" ? "" : "/site";
}

export const POS_URL = "https://pos.luvder.com";
