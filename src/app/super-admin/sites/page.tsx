import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/scope";
import { listAccessibleSites } from "@/lib/data/sites";
import { siteOverview } from "@/lib/data/site-overview";
import { SitesClient } from "./sites-client";

export default async function SitesPage() {
  const session = await requireSession();
  if (session.role !== "super_admin" && session.role !== "regional_admin") redirect("/dashboard");
  const sites = await listAccessibleSites(session);
  const overview = await siteOverview(sites.map((s) => s.id));
  return (
    <AppShell title="Sites">
      <SitesClient sites={overview} isSuperAdmin={session.role === "super_admin"} />
    </AppShell>
  );
}
