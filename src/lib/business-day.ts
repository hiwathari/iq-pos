// A restaurant's "today" for day-boundary logic (auto-void sweep, Kitchen Display's Completed
// panel) — not necessarily UTC midnight, since a shift that opens one day and runs past midnight
// the next still belongs to one business day. openTime is a "HH:MM" 24-hour clock time,
// interpreted in UTC (there's no restaurant-timezone field in the schema, so a restaurant whose
// local midnight isn't UTC midnight should set openTime accounting for that offset). Null/invalid
// falls back to plain UTC midnight — unchanged behavior for every restaurant that hasn't set one.
export function businessDayStart(now: number, openTime: string | null | undefined): number {
  const match = openTime?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return new Date(new Date(now).toISOString().slice(0, 10)).getTime();

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return new Date(new Date(now).toISOString().slice(0, 10)).getTime();

  const today = new Date(now);
  const candidate = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hours, minutes);
  return candidate <= now ? candidate : candidate - 24 * 60 * 60 * 1000;
}
