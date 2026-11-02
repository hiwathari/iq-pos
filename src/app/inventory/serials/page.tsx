import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { SerialsClient } from "./serials-client";

export default async function SerialsPage() {
  await requirePermission("inventory");
  return (
    <AppShell title="Serial numbers">
      <SerialsClient />
    </AppShell>
  );
}
