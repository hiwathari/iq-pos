"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateBusinessProfileAction,
  updateNegativeStockAction,
  updateKitchenTimerLimitAction,
  updateRestaurantCurrencyAction,
  updateRestaurantTaxEnabledAction,
  updateTillDarkModeAction,
  updateShopHoursAction,
} from "@/lib/actions/restaurants";
import { CURRENCY_OPTIONS, type BusinessType } from "@/lib/types";
import { BUSINESS_TYPES, FEATURE_SETTINGS, businessProfile, type FeatureKey, type FeatureOverrides } from "@/lib/business-profile";

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
  businessType,
  negativeStock,
  features,
  currencySymbol,
  kitchenTimerLimitMinutes,
  taxEnabled,
  tillDarkMode,
  openTime,
  closeTime,
  timezone,
}: {
  businessType: BusinessType;
  negativeStock: "allow" | "warn" | "block";
  features: FeatureOverrides | null;
  currencySymbol: string;
  kitchenTimerLimitMinutes: number;
  taxEnabled: boolean;
  tillDarkMode: boolean;
  openTime: string | null;
  closeTime: string | null;
  timezone: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [type, setType] = useState<BusinessType>(businessType);
  const [featureOn, setFeatureOn] = useState<Record<FeatureKey, boolean>>(() => businessProfile(businessType, features).features);
  const [stockMode, setStockMode] = useState(negativeStock);
  const [timerLimit, setTimerLimit] = useState(kitchenTimerLimitMinutes);
  const [taxOn, setTaxOn] = useState(taxEnabled);
  const [darkOn, setDarkOn] = useState(tillDarkMode);
  const [shopOpenTime, setShopOpenTime] = useState(openTime ?? "");
  const [shopCloseTime, setShopCloseTime] = useState(closeTime ?? "");
  const [shopTimezone, setShopTimezone] = useState(timezone);
  const [timezones] = useState(timezoneOptions);

  function handleStockModeChange(next: "allow" | "warn" | "block") {
    setStockMode(next);
    startTransition(async () => {
      await updateNegativeStockAction(next);
      router.refresh();
    });
  }

  // Switching type resets the feature switches to the new type's defaults; nothing is deleted
  // (tables, categories and printers stay, just hidden where the type doesn't use them).
  function handleBusinessTypeChange(next: BusinessType) {
    if (next === type) return;
    const label = businessProfile(next).label;
    if (!window.confirm(`Switch to ${label}? Menus, screens and wording change to suit it. Nothing is deleted — you can switch back.`)) return;
    const nextFeatures = businessProfile(next).features;
    setType(next);
    setFeatureOn(nextFeatures);
    startTransition(async () => {
      await updateBusinessProfileAction(next, nextFeatures);
      router.refresh();
    });
  }

  function handleFeatureToggle(key: FeatureKey) {
    const next = { ...featureOn, [key]: !featureOn[key] };
    setFeatureOn(next);
    startTransition(async () => {
      await updateBusinessProfileAction(type, next);
      router.refresh();
    });
  }

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

  function handleDarkModeChange(enabled: boolean) {
    setDarkOn(enabled);
    startTransition(async () => {
      await updateTillDarkModeAction(enabled);
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
      <h2 className="text-lg font-semibold text-neutral-900">Business</h2>
      <p className="mb-4 text-sm text-neutral-500">Set the currency used across dishes, the till, and reports.</p>
      <div className="flex flex-wrap gap-6">
        <div className="max-w-xs">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Business Type</label>
          <select
            value={type}
            onChange={(e) => handleBusinessTypeChange(e.target.value as BusinessType)}
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          >
            {BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>
                {businessProfile(t).label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-neutral-400">{businessProfile(type).hint}.</p>
          <div className="mt-3 space-y-2">
            {FEATURE_SETTINGS.map((f) => {
              const isDefault = featureOn[f.key] === businessProfile(type).features[f.key];
              return (
                <label key={f.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-neutral-200 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={featureOn[f.key]}
                    onChange={() => handleFeatureToggle(f.key)}
                    className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-neutral-800">{f.label}</span>
                    {!isDefault && <span className="ml-1.5 text-xs text-amber-600">changed</span>}
                    <span className="block text-xs text-neutral-400">{f.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="max-w-xs">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">When stock runs out</label>
          <div className="flex rounded-xl border border-neutral-200 p-1">
            {(
              [
                ["allow", "Allow"],
                ["warn", "Warn"],
                ["block", "Block"],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => handleStockModeChange(mode)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                  stockMode === mode ? "bg-[var(--brand)] text-white" : "text-neutral-500 hover:bg-neutral-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {stockMode === "block"
              ? "A sale that would take a tracked stock item below zero is refused, naming the item."
              : stockMode === "warn"
                ? "The sale goes through and the Till says which items are now below zero."
                : "Sales always go through; stock can go below zero and shows in red on Inventory."}
          </p>
        </div>
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
        {featureOn.kitchenDisplay && (
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
        )}
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
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">Till dark mode</label>
          <button
            onClick={() => handleDarkModeChange(!darkOn)}
            aria-pressed={darkOn}
            className={`flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-sm font-medium ${
              darkOn ? "border-teal-500 bg-teal-50 text-teal-700" : "border-neutral-200 text-neutral-500"
            }`}
          >
            <span>Dark mode {darkOn ? "On" : "Off"}</span>
            <span className={`relative h-5 w-9 rounded-full transition-colors ${darkOn ? "bg-teal-500" : "bg-neutral-300"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${darkOn ? "translate-x-4" : "translate-x-0.5"}`} />
            </span>
          </button>
          <p className="mt-1 text-xs text-neutral-400">
            Dark colours for the Till and the Kitchen Display on every device (easier on the eyes in a dim room). The rest of the app stays light.
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
