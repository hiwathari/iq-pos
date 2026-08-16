import {
  LayoutGrid,
  Coffee,
  Beef,
  Soup,
  Drumstick,
  CakeSlice,
  Moon,
  CupSoda,
  Sandwich,
  UtensilsCrossed,
  Rows3,
  Salad,
  CircleDot,
  type LucideIcon,
} from "lucide-react";
import type { CategoryIcon } from "@/lib/types";

const map: Record<CategoryIcon, LucideIcon> = {
  all: LayoutGrid,
  breakfast: Coffee,
  beef: Beef,
  biryani: Soup,
  chicken: Drumstick,
  dessert: CakeSlice,
  dinner: Moon,
  drinks: CupSoda,
  fastfood: Sandwich,
  lunch: UtensilsCrossed,
  platters: Rows3,
  salads: Salad,
  side: CircleDot,
  soups: Soup,
};

export function CategoryIconView({ icon, className }: { icon: CategoryIcon; className?: string }) {
  const Icon = map[icon] ?? LayoutGrid;
  return <Icon className={className} />;
}
