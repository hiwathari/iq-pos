"use client";

import { useRouter } from "next/navigation";

export function RestaurantPicker({
  restaurants,
  selectedId,
}: {
  restaurants: { id: string; name: string; slug: string; active: boolean }[];
  selectedId: string;
}) {
  const router = useRouter();
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
      Restaurant
      <select
        value={selectedId}
        onChange={(e) => router.push(`/super-admin/printers?restaurant=${e.target.value}`)}
        className="min-h-11 min-w-64 rounded-xl border border-neutral-200 bg-white px-3 text-base text-neutral-900 outline-none focus:border-teal-500"
      >
        {restaurants.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
            {r.active ? "" : " (inactive)"}
          </option>
        ))}
      </select>
    </label>
  );
}
