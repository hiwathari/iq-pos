// Kitchen tickets for printers (docs: Developer Guide, printing). Plain client-safe module — no
// server code, no images — so the Till builds the ticket itself and sends it straight to the
// printer: nothing about the order goes to our server just to be printed.
//
// A new order prints one ticket per kitchen printer, holding only that printer's items: an item
// goes to its own printer (dish) or else its category's printer. Editing an order prints only what
// changed ("ADDED", "CANCELLED"); "Reprint" prints the whole ticket again, marked REPRINT.
import { qtyPrefix } from "@/lib/units";
import type { Category, Dish, OrderItem } from "@/lib/types";

export interface KitchenPrinter {
  id: string;
  name: string;
  station: string;
  ip: string;
  port: number | null;
}

export interface KitchenTicketItem {
  name: string;
  qty: number;
  note?: string;
  sellBy?: string;
  unit?: string;
  // "new" prints normally; the others label what happened on an edit.
  kind?: "new" | "added" | "cancelled" | "changed";
}

export interface KitchenTicketData {
  printerName: string;
  orderNumber: string;
  createdAt: number;
  channel: string;
  tableNumber: number | null;
  guests?: number | null;
  staffName?: string;
  customerName?: string;
  items: KitchenTicketItem[];
  // Heading over the items: "NEW ORDER", "ADDED TO ORDER", "REPRINT"…
  title: string;
}

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
const hr = () => [...text("-".repeat(WIDTH)), ...lines()];

// What the printer is sent, hex-encoded the way the print bridge / Till app expect.
export function buildKitchenTicketHex(d: KitchenTicketData): string {
  const b: number[] = [ESC, 0x40, ...align(1), ...bold(true), ...size(0x01), ...text(d.printerName.toUpperCase()), ...lines(), ...size(0x00), ...bold(false)];
  b.push(...bold(true), ...text(d.title), ...bold(false), ...lines(2), ...align(0));
  b.push(...size(0x11), ...bold(true), ...text(`#${d.orderNumber}`), ...bold(false), ...size(0x00), ...lines());
  const where = d.tableNumber ? `Table ${d.tableNumber}${d.guests ? ` · ${d.guests} guest${d.guests === 1 ? "" : "s"}` : ""}` : d.channel;
  b.push(...bold(true), ...size(0x01), ...text(where), ...size(0x00), ...bold(false), ...lines());
  if (d.tableNumber) b.push(...text(d.channel), ...lines());
  const when = new Date(d.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  b.push(...text(`${when}${d.staffName ? `  ·  ${d.staffName}` : ""}`), ...lines());
  if (d.customerName) b.push(...text(d.customerName), ...lines());
  b.push(...hr());
  for (const it of d.items) {
    const prefix = it.kind === "cancelled" ? "CANCEL " : it.kind === "changed" ? "CHANGE " : it.kind === "added" ? "ADD " : "";
    b.push(...size(0x01), ...bold(true), ...text(`${prefix}${qtyPrefix(it)} ${it.name}`), ...bold(false), ...size(0x00), ...lines());
    if (it.note) b.push(...text(`   > ${it.note}`), ...lines());
  }
  b.push(...hr(), ...lines(3), GS, 0x56, 0x00);
  return b.map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Which kitchen printer an item goes to: the product's own printer, else its category's.
export function printerIdForItem(item: Pick<OrderItem, "dishId">, dishes: Dish[], categories: Category[]) {
  const dish = dishes.find((d) => d.id === item.dishId);
  if (!dish) return null;
  return dish.printerId ?? categories.find((c) => c.id === dish.categoryId)?.printerId ?? null;
}

// Splits items between the kitchen printers. Items whose printer isn't a kitchen printer (or has
// none) simply don't print anywhere.
export function routeKitchenItems(items: RoutedItem[], dishes: Dish[], categories: Category[], printers: KitchenPrinter[]) {
  const out = new Map<string, { printer: KitchenPrinter; items: KitchenTicketItem[] }>();
  for (const it of items) {
    const printerId = printerIdForItem({ dishId: it.dishId }, dishes, categories);
    const printer = printers.find((p) => p.id === printerId);
    if (!printer) continue;
    const slot = out.get(printer.id) ?? { printer, items: [] };
    slot.items.push({ name: it.name, qty: it.qty, note: it.note, sellBy: it.sellBy, unit: it.unit, kind: it.kind });
    out.set(printer.id, slot);
  }
  return [...out.values()];
}

export type RoutedItem = KitchenTicketItem & { dishId: string };

// A whole order as ticket items.
export function itemsForKitchen(items: OrderItem[]): RoutedItem[] {
  return items.map((i) => ({ dishId: i.dishId, name: i.name, qty: i.qty, note: i.note, sellBy: i.sellBy, unit: i.unit, kind: "new" as const }));
}

// What an edit changed, from the order as it was to the order as it is now.
export function diffForKitchen(before: OrderItem[], after: OrderItem[]): RoutedItem[] {
  const key = (i: OrderItem) => i.lineId ?? i.dishId;
  const was = new Map(before.map((i) => [key(i), i]));
  const out: RoutedItem[] = [];
  for (const i of after) {
    const old = was.get(key(i));
    const base = { dishId: i.dishId, name: i.name, note: i.note, sellBy: i.sellBy, unit: i.unit };
    if (!old) out.push({ ...base, qty: i.qty, kind: "added" });
    else if (i.qty > old.qty + 1e-9) out.push({ ...base, qty: Math.round((i.qty - old.qty) * 1000) / 1000, kind: "added" });
    else if (i.qty < old.qty - 1e-9) out.push({ ...base, qty: Math.round((old.qty - i.qty) * 1000) / 1000, kind: "cancelled" });
    else if ((i.note ?? "") !== (old.note ?? "")) out.push({ ...base, qty: i.qty, kind: "changed" });
    was.delete(key(i));
  }
  for (const gone of was.values()) out.push({ dishId: gone.dishId, name: gone.name, note: gone.note, sellBy: gone.sellBy, unit: gone.unit, qty: gone.qty, kind: "cancelled" });
  return out;
}
