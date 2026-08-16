import { AppShell } from "@/components/app-shell";
import { ComingSoon } from "@/components/coming-soon";
import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <AppShell title="Settings">
      <ComingSoon icon={Settings} title="Settings" description="Restaurant, tax, and payment configuration will live here." />
    </AppShell>
  );
}
