import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listStockCounts } from "@/lib/data/stock-counts";
import { listCategories } from "@/lib/data/menu";
import { StocktakeListClient } from "./stocktake-list-client";

export default async function StocktakePage() {
  const { restaurantId } = await requirePermission("stocktake");
  const [counts, categories] = await Promise.all([listStockCounts(restaurantId), listCategories(restaurantId)]);
  return (
    <AppShell title="Stocktake">
      <StocktakeListClient counts={counts} categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </AppShell>
  );
}
