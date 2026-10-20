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
  Milk,
  GlassWater,
  Citrus,
  Martini,
  IceCreamCone,
  Package,
  Popcorn,
  Amphora,
  Hamburger,
  Pizza,
  EggFried,
  Fish,
  Croissant,
  Cookie,
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

// The 14 pickable icons are generic, so a menu full of drinks categories (milk, juice, mojitos,
// shakes…) all show the same cup. Matching the category's name first gives each one a recognisable
// icon on the Till; anything unmatched falls back to the icon picked in Manage Dishes. Order
// matters — "milkshake" must hit shake before milk, "hot drinks" before the generic drinks.
const NAME_ICONS: [RegExp, LucideIcon][] = [
  [/shake|smoothie|ice ?cream|falooda|sundae/, IceCreamCone],
  [/mojito|mocktail|cocktail|martini/, Martini],
  [/juice|fresh|lime|lemon|citrus/, Citrus],
  [/milk|lassi/, Milk],
  [/hot drink|tea|chai|coffee|latte|karak/, Coffee],
  [/bottle|water/, GlassWater],
  [/cold drink|soft drink|soda|cola|drink|beverage/, CupSoda],
  [/combo|meal deal|deal|offer|box/, Package],
  [/pickle|uppilit|achar|jar/, Amphora],
  [/snack|chips|fries|popcorn/, Popcorn],
  [/burger/, Hamburger],
  [/pizza/, Pizza],
  [/sandwich|wrap|roll|shawarma/, Sandwich],
  [/breakfast|egg|omelette/, EggFried],
  [/fish|seafood|prawn/, Fish],
  [/chicken|wings|broast/, Drumstick],
  [/beef|lamb|mutton|meat|grill|kebab/, Beef],
  [/biryani|mandi|rice|kabsa/, Soup],
  [/soup/, Soup],
  [/salad/, Salad],
  [/bakery|bread|croissant|puff/, Croissant],
  [/cookie|biscuit/, Cookie],
  [/cake|dessert|sweet|kunafa/, CakeSlice],
  [/platter/, Rows3],
];

export function CategoryIconView({ icon, name, className }: { icon: string; name?: string; className?: string }) {
  const lower = name?.toLowerCase();
  const byName = lower ? NAME_ICONS.find(([re]) => re.test(lower))?.[1] : undefined;
  const Icon = byName ?? map[icon as CategoryIcon] ?? LayoutGrid;
  return <Icon className={className} />;
}
