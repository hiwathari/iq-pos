import { AppShell } from "@/components/app-shell";
import { FAQ } from "./faq";
import { HelpCenterClient } from "./help-center-client";

export default function HelpCenterPage() {
  return (
    <AppShell title="Help Center">
      <HelpCenterClient sections={FAQ} />
    </AppShell>
  );
}
