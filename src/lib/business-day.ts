// A restaurant's "today" for day-boundary logic (auto-void sweep, Kitchen Display's Completed
// panel, Reports' daily/weekly buckets) — not necessarily midnight, since a shift that opens one
// day and runs past midnight the next still belongs to one business day. openTime is a "HH:MM"
// 24-hour clock time interpreted in the restaurant's own timezone (an IANA name, e.g.
// "Europe/London" — "UTC" for every restaurant that hasn't set one, preserving the original
// plain-UTC-midnight behavior exactly). Automatically accounts for DST, since the conversion
// below asks the platform's own timezone database what the offset was at each specific instant
// rather than assuming a fixed one.

function parseOpenTime(openTime: string | null | undefined): { hours: number; minutes: number } | null {
  const match = openTime?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

export function getLocalParts(utcMs: number, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(utcMs)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

// Converts a wall-clock date/time in `timeZone` to the UTC instant it represents. Date.UTC
// normalizes out-of-range fields itself (day 0 rolls back into the previous month, etc.), so
// callers can pass e.g. day - 1 without worrying about month/year boundaries.
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  if (timeZone === "UTC") return guessUtc;
  // Ask what that guess reads as in the target zone, then correct for the difference — this
  // finds the right instant even across a DST transition, since the correction is based on the
  // zone's actual offset at (approximately) the instant in question.
  const asLocal = getLocalParts(guessUtc, timeZone);
  const asIfUtc = Date.UTC(asLocal.year, asLocal.month - 1, asLocal.day, asLocal.hour, asLocal.minute, asLocal.second);
  const offset = asIfUtc - guessUtc;
  return guessUtc - offset;
}

export function businessDayStart(now: number, openTime: string | null | undefined, timezone: string = "UTC"): number {
  const tz = timezone || "UTC";
  const open = parseOpenTime(openTime);
  const nowLocal = getLocalParts(now, tz);

  if (!open) return zonedTimeToUtc(nowLocal.year, nowLocal.month, nowLocal.day, 0, 0, tz);

  // Has today's local openTime already passed? If not, the business day that's still "open"
  // started yesterday.
  const occursBeforeNow = nowLocal.hour > open.hours || (nowLocal.hour === open.hours && nowLocal.minute >= open.minutes);
  const day = occursBeforeNow ? nowLocal.day : nowLocal.day - 1;
  return zonedTimeToUtc(nowLocal.year, nowLocal.month, day, open.hours, open.minutes, tz);
}

// The business-day key (as a "YYYY-MM-DD" local calendar date) that a given instant belongs to
// — e.g. an order placed at 12:30am local time still keys to the previous calendar date if the
// business day hasn't rolled over yet (openTime isn't midnight). Used to bucket Reports'
// daily/weekly figures the same way the Kitchen Display and auto-void sweep bucket their own.
export function businessDateKey(ts: number, openTime: string | null | undefined, timezone: string = "UTC"): string {
  const tz = timezone || "UTC";
  const dayStart = businessDayStart(ts, openTime, tz);
  const { year, month, day } = getLocalParts(dayStart, tz);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Adds (or, with a negative count, subtracts) whole days to a "YYYY-MM-DD" business-day key —
// plain calendar-date arithmetic, so no timezone is needed here (that only matters for
// converting a key to/from a UTC instant, see businessDayRange below).
export function shiftDateKey(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

// The UTC [from, to) instants spanning one business day keyed by `dateStr` ("YYYY-MM-DD", as
// businessDateKey would return it) — the counterpart Reports' date-range filtering needs to turn
// a business-day key back into a query range.
export function businessDayRange(dateStr: string, openTime: string | null | undefined, timezone: string = "UTC"): { from: number; to: number } {
  const tz = timezone || "UTC";
  const [year, month, day] = dateStr.split("-").map(Number);
  const open = parseOpenTime(openTime) ?? { hours: 0, minutes: 0 };
  const from = zonedTimeToUtc(year, month, day, open.hours, open.minutes, tz);
  const to = zonedTimeToUtc(year, month, day + 1, open.hours, open.minutes, tz);
  return { from, to };
}
