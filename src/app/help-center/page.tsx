import { AppShell } from "@/components/app-shell";
import { ComingSoon } from "@/components/coming-soon";
import { LifeBuoy } from "lucide-react";

export default function HelpCenterPage() {
  return (
    <AppShell title="Help Center">
      <ComingSoon icon={LifeBuoy} title="Help Center" description="FAQs and support contact options will live here." />
    </AppShell>
  );
}
