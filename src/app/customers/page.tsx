import { AppShell } from "@/components/app-shell";
import { requireRestaurantContext } from "@/lib/scope";
import { listReservations } from "@/lib/data/tables";
import { Users } from "lucide-react";

export default async function CustomersPage() {
  const { restaurantId } = await requireRestaurantContext();
  const reservations = await listReservations(restaurantId);

  const map = new Map<string, { name: string; phone: string | null; visits: number }>();
  for (const r of reservations) {
    if (!r.customerName || r.customerName === "Available Now") continue;
    const existing = map.get(r.customerName);
    map.set(r.customerName, { name: r.customerName, phone: r.phone, visits: (existing?.visits ?? 0) + 1 });
  }
  const customers = [...map.values()];

  return (
    <AppShell title="Customers">
      <div className="p-6">
        <h1 className="mb-6 text-xl font-semibold text-neutral-900">Customers</h1>
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Visits</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {customers.map((c) => (
                <tr key={c.name} className="hover:bg-neutral-50/60">
                  <td className="flex items-center gap-3 px-5 py-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-50 text-teal-600">
                      <Users className="h-4 w-4" />
                    </span>
                    <span className="font-medium text-neutral-800">{c.name}</span>
                  </td>
                  <td className="px-5 py-3 text-neutral-500">{c.phone || "—"}</td>
                  <td className="px-5 py-3 font-semibold text-neutral-800">{c.visits}</td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-neutral-400">
                    No customers yet.
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
