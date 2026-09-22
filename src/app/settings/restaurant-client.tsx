"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateKitchenTimerLimitAction, updateRestaurantCurrencyAction } from "@/lib/actions/restaurants";
import { CURRENCY_OPTIONS } from "@/lib/types";

export function RestaurantClient({
  currencySymbol,
  kitchenTimerLimitMinutes,
}: {
  currencySymbol: string;
  kitchenTimerLimitMinutes: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [timerLimit, setTimerLimit] = useState(kitchenTimerLimitMinutes);

  function handleCurrencyChange(symbol: string) {
    startTransition(async () => {
      await updateRestaurantCurrencyAction(symbol);
      router.refresh();
    });
  }

  function handleTimerLimitChange(minutes: number) {
    setTimerLimit(minutes);
    startTransition(async () => {
      await updateKitchenTimerLimitAction(minutes);
      router.refresh();
    });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">Restaurant</h2>
      <p className="mb-4 text-sm text-neutral-500">Set the currency used across dishes, the till, and reports.</p>
      <div className="flex flex-wrap gap-6">
        <div className="max-w-xs">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Currency</label>
          <select
            value={currencySymbol}
            onChange={(e) => handleCurrencyChange(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.symbol} value={c.symbol}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="max-w-xs">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Kitchen Ticket Timer (minutes)</label>
          <input
            type="number"
            min={1}
            max={120}
            value={timerLimit}
            onChange={(e) => handleTimerLimitChange(Math.max(1, Number(e.target.value) || 1))}
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          <p className="mt-1 text-xs text-neutral-400">
            An order&apos;s Kitchen Display timer turns fully red once it&apos;s been waiting this long.
          </p>
        </div>
      </div>
    </div>
  );
}
