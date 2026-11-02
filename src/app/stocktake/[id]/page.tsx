import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { getStockCount } from "@/lib/data/stock-counts";
import { listStockRows } from "@/lib/data/stock";
import { getRestaurant } from "@/lib/data/restaurants";
import { StocktakeClient } from "./stocktake-client";

export default async function StocktakeCountPage({ params }: { params: Promise<{ id: string }> }) {
  const { restaurantId } = await requirePermission("stocktake");
  const { id } = await params;
  const [count, rows, restaurant] = await Promise.all([getStockCount(restaurantId, id), listStockRows(restaurantId), getRestaurant(restaurantId)]);
  if (!count) notFound();
  const codes = new Map(rows.map((r) => [r.id, r.packBarcodes]));
  return (
    <AppShell title={count.name ?? "Stocktake"}>
      <StocktakeClient
        count={{ id: count.id, name: count.name ?? "Stocktake", status: count.status, lines: count.lines }}
        barcodes={Object.fromEntries(count.lines.map((l) => [l.inventoryItemId, codes.get(l.inventoryItemId) ?? []]))}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
      />
    </AppShell>
  );
}
