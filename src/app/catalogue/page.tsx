import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listAccessibleSites } from "@/lib/data/sites";
import { listCategories, listDishes } from "@/lib/data/menu";
import { CatalogueClient } from "./catalogue-client";

export default async function CataloguePage() {
  const { session, restaurantId } = await requirePermission("manage-dishes");
  const sites = (await listAccessibleSites(session)).filter((s) => s.id !== restaurantId);
  if (sites.length === 0) redirect("/manage-dishes");
  const [dishes, categories] = await Promise.all([listDishes(restaurantId), listCategories(restaurantId)]);
  return (
    <AppShell title="Catalogue">
      <CatalogueClient
        sites={sites.map((s) => ({ id: s.id, name: s.name }))}
        products={dishes.map((d) => ({ id: d.id, name: d.name, price: d.price, sku: d.sku, category: categories.find((c) => c.id === d.categoryId)?.name ?? "", masterId: d.masterId, localPrice: d.localPrice }))}
      />
    </AppShell>
  );
}
