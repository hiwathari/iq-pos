import { formatMoney } from "@/lib/types";

// Today's takings so far (business day, see lib/business-day.ts), shown beside the restaurant
// name on the Till — Cash and Card from recorded payment lines, same counting as End Day.
export function TodaySales({ cash, card, currencySymbol }: { cash: number; card: number; currencySymbol: string }) {
  return (
    <div className="flex items-center gap-3 whitespace-nowrap rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-sm text-neutral-500">
      <span className="text-[11px] font-bold uppercase tracking-wide text-neutral-400">Today</span>
      <span>
        Cash <span className="font-semibold text-neutral-800">{formatMoney(cash, currencySymbol)}</span>
      </span>
      <span>
        Card <span className="font-semibold text-neutral-800">{formatMoney(card, currencySymbol)}</span>
      </span>
      <span className="border-l border-neutral-200 pl-3 font-bold text-neutral-900">{formatMoney(cash + card, currencySymbol)}</span>
    </div>
  );
}
