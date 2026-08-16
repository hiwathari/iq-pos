import type { LucideIcon } from "lucide-react";

export function ComingSoon({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
        <Icon className="h-7 w-7" />
      </div>
      <h1 className="text-lg font-semibold text-neutral-900">{title}</h1>
      <p className="max-w-sm text-sm text-neutral-500">{description}</p>
    </div>
  );
}
