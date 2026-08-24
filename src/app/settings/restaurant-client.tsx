"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRestaurantCurrencyAction } from "@/lib/actions/restaurants";
import { CURRENCY_OPTIONS } from "@/lib/types";

export function RestaurantClient({ currencySymbol }: { currencySymbol: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleChange(symbol: string) {
    startTransition(async () => {
      await updateRestaurantCurrencyAction(symbol);
      router.refresh();
    });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">Restaurant</h2>
      <p className="mb-4 text-sm text-neutral-500">Set the currency used across dishes, the till, and reports.</p>
      <div className="max-w-xs">
        <label className="mb-1.5 block text-xs font-medium text-neutral-500">Currency</label>
        <select
          value={currencySymbol}
          onChange={(e) => handleChange(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        >
          {CURRENCY_OPTIONS.map((c) => (
            <option key={c.symbol} value={c.symbol}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
