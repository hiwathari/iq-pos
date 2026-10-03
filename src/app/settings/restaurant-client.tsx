"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateKitchenTimerLimitAction,
  updateRestaurantCurrencyAction,
  updateRestaurantTaxEnabledAction,
  updateShopHoursAction,
} from "@/lib/actions/restaurants";
import { CURRENCY_OPTIONS } from "@/lib/types";

// Common IANA zones every restaurant is realistically in — falls back to this if the browser
// doesn't support Intl.supportedValuesOf (older Safari/WebView on an older Till tablet).
const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Australia/Sydney",
];

function timezoneOptions() {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return FALLBACK_TIMEZONES;
  }
}

export function RestaurantClient({
  currencySymbol,
  kitchenTimerLimitMinutes,
  taxEnabled,
  openTime,
  closeTime,
  timezone,
}: {
  currencySymbol: string;
  kitchenTimerLimitMinutes: number;
  taxEnabled: boolean;
  openTime: string | null;
  closeTime: string | null;
  timezone: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [timerLimit, setTimerLimit] = useState(kitchenTimerLimitMinutes);
  const [taxOn, setTaxOn] = useState(taxEnabled);
  const [shopOpenTime, setShopOpenTime] = useState(openTime ?? "");
  const [shopCloseTime, setShopCloseTime] = useState(closeTime ?? "");
  const [shopTimezone, setShopTimezone] = useState(timezone);
  const [timezones] = useState(timezoneOptions);

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

  function handleShopHoursChange(nextOpen: string, nextClose: string, nextTimezone: string) {
    setShopOpenTime(nextOpen);
    setShopCloseTime(nextClose);
    setShopTimezone(nextTimezone);
    startTransition(async () => {
      await updateShopHoursAction(nextOpen, nextClose, nextTimezone);
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
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Timezone</label>
          <select
            value={shopTimezone}
            onChange={(e) => handleShopHoursChange(shopOpenTime, shopCloseTime, e.target.value)}
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-400">
            What Shop Hours below is set in, and what Reports&apos; daily/weekly figures use for day boundaries.
            Automatically accounts for daylight saving.
          </p>
        </div>
        <div className="max-w-xs">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Shop Hours</label>
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={shopOpenTime}
              onChange={(e) => handleShopHoursChange(e.target.value, shopCloseTime, shopTimezone)}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
            <span className="text-xs font-medium text-neutral-400">to</span>
            <input
              type="time"
              value={shopCloseTime}
              onChange={(e) => handleShopHoursChange(shopOpenTime, e.target.value, shopTimezone)}
              className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            When a shift runs past midnight, the opening time is what counts as the start of a new day — for the
            Kitchen Display&apos;s Completed list, the overnight auto-void cleanup, and Reports. In the timezone set
            above, not UTC. Leave blank to keep the old plain-midnight behavior.
          </p>
        </div>
      </div>
    </div>
  );
}
