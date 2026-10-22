import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { listWebsiteRequests } from "@/lib/data/website-requests";
import { getAnthropicKeyStatus } from "@/lib/platform-settings";
import { requireSession } from "@/lib/scope";
import { WebsiteRequestsClient } from "./website-requests-client";

async function keyStatus() {
  try {
    return await getAnthropicKeyStatus();
  } catch {
    return null;
  }
}

export default async function WebsiteRequestsPage() {
  const session = await requireSession();
  if (session.role !== "super_admin") redirect("/super-admin");

  const [requests, aiKey] = await Promise.all([listWebsiteRequests(), keyStatus()]);

  return (
    <AppShell title="Website Requests">
      <WebsiteRequestsClient requests={requests} aiKey={aiKey} blobEnabled={!!process.env.BLOB_READ_WRITE_TOKEN} />
    </AppShell>
  );
}
