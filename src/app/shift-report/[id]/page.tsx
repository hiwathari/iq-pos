import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/scope";
import { getShift } from "@/lib/data/shifts";
import { getRestaurant } from "@/lib/data/restaurants";
import { ShiftReportClient } from "./shift-report-client";

export default async function ShiftReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { restaurantId } = await requirePermission("end-day");

  const [shift, restaurant] = await Promise.all([getShift(restaurantId, id), getRestaurant(restaurantId)]);
  if (!shift) notFound();

  return (
    <ShiftReportClient
      shift={shift}
      restaurantName={restaurant?.name ?? "IQ POS"}
      currencySymbol={restaurant?.currencySymbol ?? "£"}
      brandColor={restaurant?.brandColor}
    />
  );
}
