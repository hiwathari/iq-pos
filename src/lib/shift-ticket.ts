// The End Day report as an ESC/POS ticket for the receipt printer (docs: Developer Guide, printing).
// Plain client-safe module (no server imports) — the Till builds it in the browser from the shift the
// server just closed and sends it straight to the printer, like the kitchen tickets. Same figures as
// the on-screen report (app/shift-report/[id]).
import { formatMoney, shiftTotals, type Shift } from "@/lib/types";

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const WIDTH = 48;

const enc = new TextEncoder();
const text = (s: string) => Array.from(enc.encode(s));
const lines = (n = 1) => Array<number>(n).fill(LF);
const align = (n: 0 | 1) => [ESC, 0x61, n];
const size = (n: number) => [GS, 0x21, n]; // 0x00 normal, 0x11 double width+height, 0x01 double height
const bold = (on: boolean) => [ESC, 0x45, on ? 1 : 0];
const hr = (ch = "-") => [...text(ch.repeat(WIDTH)), ...lines()];

function row(label: string, value: string, strong = false): number[] {
  const cut = label.length > WIDTH - value.length - 1 ? label.slice(0, WIDTH - value.length - 2) + "." : label;
  const line = cut + " ".repeat(Math.max(1, WIDTH - cut.length - value.length)) + value;
  return strong ? [...bold(true), ...text(line), ...bold(false), ...lines()] : [...text(line), ...lines()];
}

// Four columns (48 characters): method, taken, POS, difference — wide enough for 'Short £12065.71'.
function takingsRow(method: string, taken: string, pos: string, diff: string, strong = false): number[] {
  const line = method.slice(0, 11).padEnd(11) + taken.padStart(10) + pos.padStart(10) + diff.padStart(17);
  return strong ? [...bold(true), ...text(line), ...bold(false), ...lines()] : [...text(line), ...lines()];
}

function diffText(value: number, symbol: string) {
  if (Math.abs(value) < 0.01) return "Matches";
  return `${value > 0 ? "Over" : "Short"} ${formatMoney(Math.abs(value), symbol)}`;
}

function when(ms: number) {
  return new Date(ms).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function buildShiftReportHex(input: { restaurantName: string; currencySymbol: string; shift: Shift }): string {
  const { restaurantName, currencySymbol: cs, shift } = input;
  const totals = shiftTotals(shift);
  const variance = shift.cashCounted - shift.expectedCash;
  const balanced = Math.abs(variance) < 0.01;
  const terminalMethods = [
    ...new Set([...(shift.terminalSales ?? []).map((t) => t.method), ...(shift.terminalCounts ?? []).map((c) => c.method)]),
  ].filter((m) => m !== "Cash");
  const takings = [
    { method: "Cash", taken: totals.cashTaken, pos: shift.cashSales },
    ...terminalMethods.map((method) => ({
      method,
      taken: shift.terminalCounts?.find((c) => c.method === method)?.counted ?? 0,
      pos: shift.terminalSales?.find((t) => t.method === method)?.amount ?? 0,
    })),
  ];

  const b: number[] = [ESC, 0x40, ...align(1), ...bold(true), ...size(0x11), ...text(restaurantName.toUpperCase().slice(0, 24)), ...lines(), ...size(0x00)];
  b.push(...text("END DAY REPORT"), ...bold(false), ...lines(2), ...align(0));
  b.push(...row("Closed by", shift.closedByName ?? "-"));
  b.push(...row("Shift start", when(shift.openedAt)));
  b.push(...row("Shift end", when(shift.closedAt)));
  b.push(...hr());

  b.push(...align(1), ...text("TOTAL TAKEN"), ...lines(), ...bold(true), ...size(0x11), ...text(formatMoney(totals.finalTotal, cs)), ...size(0x00), ...bold(false), ...lines(), ...align(0));
  b.push(...row("Cash", formatMoney(totals.cashTaken, cs)));
  b.push(...row("Card machines", formatMoney(totals.cardTaken, cs)));
  b.push(...row("POS recorded", formatMoney(totals.posTotal, cs)));
  b.push(...row("Difference", diffText(totals.difference, cs), true));
  b.push(...row("Orders", String(shift.orderCount)));
  if (shift.voidCount > 0) b.push(...row("Voided", `${shift.voidCount} (${formatMoney(shift.voidAmount, cs)})`));
  if (shift.tipTotal > 0) b.push(...row("Tips (included above)", formatMoney(shift.tipTotal, cs)));
  b.push(...hr());

  b.push(...bold(true), ...text("TAKINGS VS POS"), ...bold(false), ...lines());
  b.push(...takingsRow("Method", "Taken", "POS", "Difference", true));
  for (const r of takings) b.push(...takingsRow(r.method, formatMoney(r.taken, cs), formatMoney(r.pos, cs), diffText(r.taken - r.pos, cs)));
  b.push(...takingsRow("Total", formatMoney(totals.finalTotal, cs), formatMoney(totals.posTotal, cs), diffText(totals.difference, cs), true));
  if (shift.otherSales > 0) b.push(...text(`Unpaid on the POS (not taken): ${formatMoney(shift.otherSales, cs)}`), ...lines());
  b.push(...hr());

  b.push(...bold(true), ...text("CASH RECONCILIATION"), ...bold(false), ...lines());
  b.push(...row("Opening balance", formatMoney(shift.openingBalance, cs)));
  b.push(...row("Cash sales", formatMoney(shift.cashSales, cs)));
  if (shift.cashExpenses > 0) b.push(...row("Less: cash expenses", `-${formatMoney(shift.cashExpenses, cs)}`));
  if (shift.envelopeCash > 0) b.push(...row("Less: envelope cash", `-${formatMoney(shift.envelopeCash, cs)}`));
  b.push(...row("Expected cash in till", formatMoney(shift.expectedCash, cs)));
  b.push(...row("Cash counted", formatMoney(shift.cashCounted, cs)));
  b.push(...row(balanced ? "BALANCED" : variance > 0 ? "OVER BY" : "SHORT BY", formatMoney(Math.abs(variance), cs), true));
  if (shift.cardExpenses > 0) b.push(...row("Card expenses", formatMoney(shift.cardExpenses, cs)));
  if (shift.notes) b.push(...hr(), ...bold(true), ...text("NOTES"), ...bold(false), ...lines(), ...text(shift.notes), ...lines());

  b.push(...hr("="), ...align(1), ...text("Generated by IQ POS"), ...lines(4), GS, 0x56, 0x00);
  return b.map((x) => x.toString(16).padStart(2, "0")).join("");
}
