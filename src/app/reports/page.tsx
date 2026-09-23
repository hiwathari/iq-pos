import { AppShell } from "@/components/app-shell";
import { assertAdmin, requireRestaurantContext } from "@/lib/scope";
import { getReportData } from "@/lib/data/reports";
import { getRestaurant } from "@/lib/data/restaurants";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage() {
  const { session, restaurantId } = await requireRestaurantContext();
  assertAdmin(session);
  const [report, restaurant] = await Promise.all([getReportData(restaurantId), getRestaurant(restaurantId)]);
  const currencySymbol = restaurant?.currencySymbol ?? "£";

  return (
    <AppShell title="Reports">
      <div className="p-6">
        <h1 className="mb-6 text-xl font-semibold text-neutral-900">Reports</h1>
        <ReportsClient report={report} currencySymbol={currencySymbol} />
      </div>
    </AppShell>
  );
}
