import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listTradeAccounts } from "@/lib/data/trade-accounts";
import { getRestaurant } from "@/lib/data/restaurants";
import { TradeAccountsClient } from "./trade-accounts-client";

export default async function TradeAccountsPage() {
  const { restaurantId } = await requirePermission("trade-accounts");
  const [accounts, restaurant] = await Promise.all([listTradeAccounts(restaurantId), getRestaurant(restaurantId)]);
  return (
    <AppShell title="Trade Accounts">
      <TradeAccountsClient accounts={accounts} currencySymbol={restaurant?.currencySymbol ?? "£"} />
    </AppShell>
  );
}
