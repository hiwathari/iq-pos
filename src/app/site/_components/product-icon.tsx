import { AtSign, Bot, Box, CalendarDays, Gift, Heart, Receipt, Search, Smartphone, Sparkles, type LucideProps } from "lucide-react";
import type { ProductIcon as ProductIconName, ProductStatus } from "@/lib/site/products";
import { STATUS_LABEL } from "@/lib/site/products";

const ICONS = {
  sparkles: Sparkles,
  box: Box,
  smartphone: Smartphone,
  calendar: CalendarDays,
  heart: Heart,
  gift: Gift,
  instagram: AtSign,
  search: Search,
  bot: Bot,
  receipt: Receipt,
} satisfies Record<ProductIconName, unknown>;

export function ProductIcon({ name, ...props }: { name: ProductIconName } & LucideProps) {
  const Icon = ICONS[name];
  return <Icon {...props} />;
}

export function StatusBadge({ status, className = "" }: { status: ProductStatus; className?: string }) {
  const tone =
    status === "live"
      ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25"
      : status === "early"
        ? "bg-teal-300/10 text-teal-200 ring-teal-300/30"
        : "bg-white/5 text-white/55 ring-white/10";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${tone} ${className}`}>
      {status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />}
      {STATUS_LABEL[status]}
    </span>
  );
}
