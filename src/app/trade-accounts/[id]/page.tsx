import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { agedDebt, getTradeAccount, tradeStatement } from "@/lib/data/trade-accounts";
import { getRestaurant } from "@/lib/data/restaurants";
import { StatementClient } from "./statement-client";

export default async function TradeAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { restaurantId } = await requirePermission("trade-accounts");
  const { id } = await params;
  const [account, restaurant] = await Promise.all([getTradeAccount(restaurantId, id), getRestaurant(restaurantId)]);
  if (!account) notFound();
  const statement = await tradeStatement(restaurantId, id);
  // eslint-disable-next-line react-hooks/purity
  const aged = agedDebt(statement.lines, account.paymentTermsDays ?? 0, Date.now());
  return (
    <AppShell title={account.companyName}>
      <StatementClient
        account={{ id: account.id, companyName: account.companyName, billingAddress: account.billingAddress, vatNumber: account.vatNumber, creditLimit: account.creditLimit, paymentTermsDays: account.paymentTermsDays, balance: account.balance, onHold: account.onHold }}
        lines={statement.lines}
        aged={aged}
        business={{ name: restaurant?.name ?? "", address: restaurant?.invoiceAddress ?? null }}
        currencySymbol={restaurant?.currencySymbol ?? "£"}
      />
    </AppShell>
  );
}
