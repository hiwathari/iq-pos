import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listPromotions, toPromotionDef } from "@/lib/data/promotions";
import { listCategories, listDishes } from "@/lib/data/menu";
import { getRestaurant } from "@/lib/data/restaurants";
import { businessProfile } from "@/lib/business-profile";
import { PromotionsClient } from "./promotions-client";

export default async function PromotionsPage() {
  const { restaurantId } = await requirePermission("promotions");
  const [rows, dishes, categories, restaurant] = await Promise.all([listPromotions(restaurantId), listDishes(restaurantId), listCategories(restaurantId), getRestaurant(restaurantId)]);
  const profile = businessProfile(restaurant?.businessType, restaurant?.features);
  return (
    <AppShell title="Promotions">
      <PromotionsClient
        promotions={rows.map((r) => ({ ...toPromotionDef(r), createdAt: r.createdAt }))}
        products={dishes.filter((d) => d.sellBy === "unit").map((d) => ({ id: d.id, name: d.name, price: d.price, categoryId: d.categoryId }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        channels={profile.channels}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
        productWord={profile.words.product.toLowerCase()}
      />
    </AppShell>
  );
}
