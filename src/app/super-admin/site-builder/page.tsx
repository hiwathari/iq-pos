import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/scope";
import { getBuilderOverview } from "@/lib/site/admin";
import { SiteBuilderClient } from "./site-builder-client";

export default async function SiteBuilderPage() {
  const session = await requireSession();
  if (session.role !== "super_admin") redirect("/super-admin");
  const overview = await getBuilderOverview();
  return (
    <AppShell title="Website builder">
      <SiteBuilderClient overview={overview} />
    </AppShell>
  );
}
