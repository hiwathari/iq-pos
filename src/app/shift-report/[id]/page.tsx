import { notFound } from "next/navigation";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { getShift } from "@/lib/data/shifts";
import { getRestaurant } from "@/lib/data/restaurants";
import { ShiftReportClient } from "./shift-report-client";

export default async function ShiftReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);

  const [shift, restaurant] = await Promise.all([getShift(restaurantId, id), getRestaurant(restaurantId)]);
  if (!shift) notFound();

  return (
    <ShiftReportClient shift={shift} restaurantName={restaurant?.name ?? "IQ POS"} currencySymbol={restaurant?.currencySymbol ?? "£"} />
  );
}
