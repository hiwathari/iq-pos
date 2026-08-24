import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/scope";
import { listRestaurantsWithStats, platformTotals } from "@/lib/data/restaurants";
import { SuperAdminClient } from "./super-admin-client";

export default async function SuperAdminPage() {
  const session = await requireSession();
  if (session.role !== "super_admin") redirect("/dashboard");

  const [restaurants, totals] = await Promise.all([listRestaurantsWithStats(), platformTotals()]);

  return (
    <AppShell title="Super Admin">
      <SuperAdminClient restaurants={restaurants} totals={totals} />
    </AppShell>
  );
}
