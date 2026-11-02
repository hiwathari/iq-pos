import Link from "next/link";
import { Plus } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { requirePermission } from "@/lib/scope";
import { listPurchaseOrders } from "@/lib/data/purchase-orders";
import { getRestaurant } from "@/lib/data/restaurants";
import { formatMoney } from "@/lib/types";
import { PO_STATUS } from "./status";

export default async function PurchaseOrdersPage() {
  const { restaurantId } = await requirePermission("purchase-orders");
  const [orders, restaurant] = await Promise.all([listPurchaseOrders(restaurantId), getRestaurant(restaurantId)]);
  const symbol = restaurant?.currencySymbol ?? "£";
  return (
    <AppShell title="Purchase Orders">
      <div className="p-6">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-neutral-900">Purchase Orders</h1>
            <p className="text-sm text-neutral-400">What you&apos;ve ordered from suppliers and what has arrived.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/inventory/reorder" className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
              Reorder suggestions
            </Link>
            <Link href="/purchase-orders/new" className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
              <Plus className="h-4 w-4" /> New Order
            </Link>
          </div>
        </div>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-5 py-3">Order</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-3 font-semibold">
                    <Link href={`/purchase-orders/${o.id}`} className="text-[var(--brand-dark)] hover:underline">
                      {o.number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{o.supplierName}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${PO_STATUS[o.status].tone}`}>{PO_STATUS[o.status].label}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-500">{o.lineCount}</td>
                  <td className="px-4 py-3 text-right text-neutral-700">{o.total != null ? formatMoney(o.total, symbol) : "—"}</td>
                  <td className="px-4 py-3 text-xs text-neutral-400">{new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-neutral-400">
                    No purchase orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
