"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateDirectServeModeAction,
  updateKitchenTimerLimitAction,
  updateRestaurantCurrencyAction,
  updateRestaurantTaxEnabledAction,
} from "@/lib/actions/restaurants";
import { CURRENCY_OPTIONS } from "@/lib/types";

export function RestaurantClient({
  currencySymbol,
  kitchenTimerLimitMinutes,
  taxEnabled,
  directServeMode,
}: {
  currencySymbol: string;
  kitchenTimerLimitMinutes: number;
  taxEnabled: boolean;
  directServeMode: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [timerLimit, setTimerLimit] = useState(kitchenTimerLimitMinutes);
  const [taxOn, setTaxOn] = useState(taxEnabled);
  const [directServeOn, setDirectServeOn] = useState(directServeMode);

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

  function handleTaxEnabledChange(enabled: boolean) {
    setTaxOn(enabled);
    startTransition(async () => {
      await updateRestaurantTaxEnabledAction(enabled);
      router.refresh();
    });
  }

  function handleDirectServeChange(enabled: boolean) {
    setDirectServeOn(enabled);
    startTransition(async () => {
      await updateDirectServeModeAction(enabled);
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
        <div className="max-w-xs">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Tax</label>
          <button
            onClick={() => handleTaxEnabledChange(!taxOn)}
            className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-medium ${
              taxOn ? "border-teal-500 bg-teal-50 text-teal-700" : "border-neutral-200 text-neutral-500"
            }`}
          >
            <span>Tax {taxOn ? "Enabled" : "Disabled"}</span>
            <span
              className={`relative h-5 w-9 rounded-full transition-colors ${taxOn ? "bg-teal-500" : "bg-neutral-300"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  taxOn ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
          <p className="mt-1 text-xs text-neutral-400">
            Off by default. Each category in Manage Dishes has its own tax rate, applied only once this is on.
          </p>
        </div>
        <div className="max-w-xs">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Order Workflow</label>
          <button
            onClick={() => handleDirectServeChange(!directServeOn)}
            className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-medium ${
              directServeOn ? "border-teal-500 bg-teal-50 text-teal-700" : "border-neutral-200 text-neutral-500"
            }`}
          >
            <span>Direct Order & Pay {directServeOn ? "On" : "Off"}</span>
            <span
              className={`relative h-5 w-9 rounded-full transition-colors ${directServeOn ? "bg-teal-500" : "bg-neutral-300"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  directServeOn ? "translate-x-4" : "translate-x-0.5"
                }`}
              />
            </span>
          </button>
          <p className="mt-1 text-xs text-neutral-400">
            For counter-service places with no kitchen ticket step (e.g. a cafe). A new order that&apos;s paid in full
            is saved straight as Served — it never goes to the Kitchen Display.
          </p>
        </div>
      </div>
    </div>
  );
}
