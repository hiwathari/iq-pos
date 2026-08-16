import { AppShell } from "@/components/app-shell";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { listCategories, listDishes } from "@/lib/data/menu";
import { ManageDishesClient } from "./manage-dishes-client";

export default async function ManageDishesPage() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);

  const [categories, dishes] = await Promise.all([listCategories(restaurantId), listDishes(restaurantId)]);

  return (
    <AppShell title="Manage Dishes">
      <ManageDishesClient categories={categories} dishes={dishes} />
    </AppShell>
  );
}
