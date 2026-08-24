"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { Dish } from "@/lib/types";
import { PRICING_CHANNELS, formatMoney } from "@/lib/types";
import { setChannelPriceAction } from "@/lib/actions/menu";

export function PricingClient({ dishes, currencySymbol }: { dishes: Dish[]; currencySymbol: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const filtered = dishes.filter((d) => d.name.toLowerCase().includes(query.toLowerCase()));

  function cellKey(dishId: string, channel: string) {
    return `${dishId}:${channel}`;
  }

  function commit(dishId: string, channel: string, raw: string) {
    const trimmed = raw.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    startTransition(async () => {
      await setChannelPriceAction(dishId, channel, value);
      router.refresh();
    });
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Channel Pricing</h1>
          <p className="text-sm text-neutral-500">
            Set a different price per platform. Leave blank to fall back to the base price.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes"
            className="w-64 rounded-xl border border-neutral-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-400">
            <tr>
              <th className="sticky left-0 bg-neutral-50 px-4 py-3">Dish</th>
              <th className="px-4 py-3">Base</th>
              {PRICING_CHANNELS.map((c) => (
                <th key={c} className="px-4 py-3 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {filtered.map((dish) => (
              <tr key={dish.id}>
                <td className="sticky left-0 whitespace-nowrap bg-white px-4 py-2.5 font-medium text-neutral-800">
                  <span className="mr-2">{dish.emoji}</span>
                  {dish.name}
                </td>
                <td className="px-4 py-2.5 text-neutral-500">{formatMoney(dish.price, currencySymbol)}</td>
                {PRICING_CHANNELS.map((c) => {
                  const key = cellKey(dish.id, c);
                  const override = dish.channelPrices?.[c];
                  const value = drafts[key] ?? (override !== undefined ? String(override) : "");
                  return (
                    <td key={c} className="px-4 py-2.5">
                      <input
                        value={value}
                        placeholder={dish.price.toFixed(2)}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                        onBlur={(e) => commit(dish.id, c, e.target.value)}
                        inputMode="decimal"
                        className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={PRICING_CHANNELS.length + 2} className="px-4 py-10 text-center text-neutral-400">
                  No dishes found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
