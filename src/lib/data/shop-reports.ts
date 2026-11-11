import "server-only";
import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  ageChecks,
  categories,
  dishes,
  inventoryItems,
  orders,
  purchaseOrderLines,
  purchaseOrders,
  refunds,
  stockBatches,
  stockLevels,
  stockLocations,
  stockMovements,
  suppliers,
} from "@/db/schema";
import { filterOrdersForAccountsRole } from "@/lib/accounts-filter";
import { businessDateKey } from "@/lib/business-day";
import { lineTotal, orderBreakdown, type Order } from "@/lib/types";
import { agedDebt, listTradeAccounts, tradeStatement } from "./trade-accounts";
import { siteOverview } from "./site-overview";
import type { BusinessDayConfig } from "./reports";

// Reports for shops and warehouses (docs/retail-plan step 7.1). Every report is returned in one
// plain shape — optional headline figures plus one or more tables — so the page can show it, sort
// it and export it to CSV the same way for all of them. Money columns are in the currency, quantity
// columns are plain numbers, "pct" is a 0–1 fraction.

export type ShopColumnType = "text" | "money" | "qty" | "pct" | "date" | "int";
export interface ShopColumn {
  key: string;
  label: string;
  type: ShopColumnType;
}
export type ShopCell = string | number | null;
export interface ShopTable {
  title?: string;
  columns: ShopColumn[];
  rows: Record<string, ShopCell>[];
  empty?: string;
}
export interface ShopKpi {
  label: string;
  value: number | string;
  type: ShopColumnType;
  hint?: string;
  warn?: boolean;
}
export interface ShopReport {
  title: string;
  note?: string;
  kpis?: ShopKpi[];
  tables: ShopTable[];
}

export const SHOP_REPORT_TABS = [
  "shopdash",
  "margin",
  "stockvalue",
  "movements",
  "losses",
  "dead",
  "weight",
  "refundsr",
  "promos",
  "agechecks",
  "supplierspend",
  "expiry",
  "agedebt",
  "multisite",
] as const;

const DAY = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

const col = (key: string, label: string, type: ShopColumnType = "text"): ShopColumn => ({ key, label, type });

interface Ctx {
  restaurantId: string;
  range: { from: number; to: number };
  businessDay: BusinessDayConfig;
  accountsFilter?: { defaultTerminalName: string | null };
}

async function ordersInRange(c: Ctx, from = c.range.from, to = c.range.to) {
  const rows = (await db.select().from(orders).where(and(eq(orders.restaurantId, c.restaurantId), gte(orders.createdAt, from), lt(orders.createdAt, to)))) as Order[];
  return c.accountsFilter ? filterOrdersForAccountsRole(rows, c.accountsFilter.defaultTerminalName) : rows;
}

async function catalogue(restaurantId: string) {
  const [allDishes, cats, items, sups] = await Promise.all([
    db.select().from(dishes).where(eq(dishes.restaurantId, restaurantId)),
    db.select().from(categories).where(eq(categories.restaurantId, restaurantId)),
    db.select().from(inventoryItems).where(eq(inventoryItems.restaurantId, restaurantId)),
    db.select().from(suppliers).where(eq(suppliers.restaurantId, restaurantId)),
  ]);
  const dishById = new Map(allDishes.map((d) => [d.id, d]));
  const catName = new Map(cats.map((x) => [x.id, x.name]));
  const supName = new Map(sups.map((x) => [x.id, x.name]));
  const itemByVariant = new Map(items.filter((i) => i.variantId).map((i) => [i.variantId as string, i]));
  // What one unit of a sold line cost: the variant's own stock cost, else the product's.
  const costOf = (line: { dishId: string; variantId?: string }) => {
    if (line.variantId) {
      const c = itemByVariant.get(line.variantId)?.costPrice;
      if (c != null) return c;
    }
    return dishById.get(line.dishId)?.costPrice ?? null;
  };
  return { allDishes, cats, items, sups, dishById, catName, supName, costOf };
}

// ---- Margin -----------------------------------------------------------------------------------

async function marginReport(c: Ctx, by: string): Promise<ShopReport> {
  const [list, cat] = await Promise.all([ordersInRange(c), catalogue(c.restaurantId)]);
  const live = list.filter((o) => o.status !== "Voided");
  type Row = { name: string; qty: number; revenue: number; costedRevenue: number; cost: number; uncosted: number };
  const groups = new Map<string, Row>();
  for (const o of live) {
    for (const it of o.items) {
      const dish = cat.dishById.get(it.dishId);
      const key =
        by === "category"
          ? (dish ? (cat.catName.get(dish.categoryId) ?? "Other") : "Custom / other")
          : by === "supplier"
            ? (dish?.supplierId ? (cat.supName.get(dish.supplierId) ?? "Unknown supplier") : "No supplier")
            : by === "staff"
              ? (o.createdByName ?? "Unattributed")
              : it.name;
      const row = groups.get(key) ?? { name: key, qty: 0, revenue: 0, costedRevenue: 0, cost: 0, uncosted: 0 };
      const rev = lineTotal(it);
      const unitCost = cat.costOf(it);
      row.qty += it.qty;
      row.revenue += rev;
      if (unitCost == null) row.uncosted += rev;
      else {
        row.cost += unitCost * it.qty;
        row.costedRevenue += rev;
      }
      groups.set(key, row);
    }
  }
  const rows = [...groups.values()]
    .map((r) => ({
      name: r.name,
      qty: r3(r.qty),
      revenue: r2(r.revenue),
      cost: r2(r.cost),
      profit: r2(r.costedRevenue - r.cost),
      margin: r.costedRevenue > 0 ? (r.costedRevenue - r.cost) / r.costedRevenue : null,
      uncosted: r2(r.uncosted),
    }))
    .sort((a, b) => b.profit - a.profit);
  const totRev = rows.reduce((s, r) => s + r.revenue, 0);
  const totCost = rows.reduce((s, r) => s + r.cost, 0);
  const totUncosted = rows.reduce((s, r) => s + r.uncosted, 0);
  const costedRev = totRev - totUncosted;
  return {
    title: "Margin",
    note: "Revenue is before order-level discounts; cost is each product's cost price today (set it on the product). Sales of products without a cost price are listed but left out of profit and margin.",
    kpis: [
      { label: "Revenue", value: r2(totRev), type: "money" },
      { label: "Cost of goods", value: r2(totCost), type: "money" },
      { label: "Gross profit", value: r2(costedRev - totCost), type: "money" },
      { label: "Margin", value: costedRev > 0 ? (costedRev - totCost) / costedRev : 0, type: "pct" },
      { label: "Sales without a cost price", value: r2(totUncosted), type: "money", warn: totUncosted > 0 },
    ],
    tables: [
      {
        columns: [
          col("name", by === "category" ? "Category" : by === "supplier" ? "Supplier" : by === "staff" ? "Staff" : "Product"),
          col("qty", "Qty", "qty"),
          col("revenue", "Revenue", "money"),
          col("cost", "Cost", "money"),
          col("profit", "Profit", "money"),
          col("margin", "Margin", "pct"),
          col("uncosted", "Sold without a cost", "money"),
        ],
        rows,
        empty: "No sales in this period.",
      },
    ],
  };
}

// ---- Stock value ------------------------------------------------------------------------------

async function stockValueReport(c: Ctx): Promise<ShopReport> {
  const cat = await catalogue(c.restaurantId);
  const [levels, locs] = await Promise.all([
    db.select({ inventoryItemId: stockLevels.inventoryItemId, locationId: stockLevels.locationId, quantity: stockLevels.quantity }).from(stockLevels).innerJoin(inventoryItems, eq(inventoryItems.id, stockLevels.inventoryItemId)).where(eq(inventoryItems.restaurantId, c.restaurantId)),
    db.select().from(stockLocations).where(eq(stockLocations.restaurantId, c.restaurantId)),
  ]);
  const byCat = new Map<string, { name: string; items: number; units: number; cost: number; sale: number; nocost: number }>();
  let cost = 0;
  let sale = 0;
  let noCost = 0;
  for (const i of cat.items) {
    if (i.quantity <= 0) continue;
    const dish = i.dishId ? cat.dishById.get(i.dishId) : undefined;
    const key = dish ? (cat.catName.get(dish.categoryId) ?? "Other") : "Ingredients & other stock";
    const row = byCat.get(key) ?? { name: key, items: 0, units: 0, cost: 0, sale: 0, nocost: 0 };
    const atCost = i.costPrice != null ? i.quantity * i.costPrice : 0;
    const atSale = dish ? i.quantity * dish.price : 0;
    row.items += 1;
    row.units += i.quantity;
    row.cost += atCost;
    row.sale += atSale;
    if (i.costPrice == null) {
      row.nocost += 1;
      noCost += 1;
    }
    cost += atCost;
    sale += atSale;
    byCat.set(key, row);
  }
  const itemById = new Map(cat.items.map((i) => [i.id, i]));
  const locName = new Map(locs.map((l) => [l.id, l.name ? `${l.code} — ${l.name}` : l.code]));
  const byLoc = new Map<string, { name: string; items: number; units: number; cost: number }>();
  for (const l of levels) {
    if (l.quantity <= 0) continue;
    const it = itemById.get(l.inventoryItemId);
    const key = locName.get(l.locationId) ?? "Unknown location";
    const row = byLoc.get(key) ?? { name: key, items: 0, units: 0, cost: 0 };
    row.items += 1;
    row.units += l.quantity;
    row.cost += l.quantity * (it?.costPrice ?? 0);
    byLoc.set(key, row);
  }
  const tables: ShopTable[] = [
    {
      title: "By category",
      columns: [col("name", "Category"), col("items", "Items", "int"), col("units", "Units", "qty"), col("cost", "Value at cost", "money"), col("sale", "Value at sale price", "money"), col("nocost", "Without a cost price", "int")],
      rows: [...byCat.values()].map((r) => ({ ...r, units: r3(r.units), cost: r2(r.cost), sale: r2(r.sale) })).sort((a, b) => b.cost - a.cost),
      empty: "No stock on hand.",
    },
  ];
  if (byLoc.size > 0) {
    tables.push({
      title: "By location (bins)",
      columns: [col("name", "Location"), col("items", "Items", "int"), col("units", "Units", "qty"), col("cost", "Value at cost", "money")],
      rows: [...byLoc.values()].map((r) => ({ ...r, units: r3(r.units), cost: r2(r.cost) })).sort((a, b) => b.cost - a.cost),
    });
  }
  return {
    title: "Stock value",
    note: "As of now (not the chosen dates). Negative quantities are left out.",
    kpis: [
      { label: "Value at cost", value: r2(cost), type: "money" },
      { label: "Value at sale price", value: r2(sale), type: "money" },
      { label: "Potential profit", value: r2(sale - cost), type: "money" },
      { label: "Items without a cost price", value: noCost, type: "int", warn: noCost > 0 },
    ],
    tables,
  };
}

// ---- Stock movements and losses ---------------------------------------------------------------

async function movementRows(c: Ctx, reasons?: string[]) {
  const rows = await db
    .select()
    .from(stockMovements)
    .where(and(eq(stockMovements.restaurantId, c.restaurantId), gte(stockMovements.createdAt, c.range.from), lt(stockMovements.createdAt, c.range.to), ...(reasons ? [inArray(stockMovements.reason, reasons as never[])] : [])));
  const items = await db.select().from(inventoryItems).where(eq(inventoryItems.restaurantId, c.restaurantId));
  return { rows, itemById: new Map(items.map((i) => [i.id, i])) };
}

const REASON_LABEL: Record<string, string> = {
  sale: "Sold",
  void: "Put back (void)",
  edit: "Order edited",
  refund: "Returned to stock",
  received: "Received",
  adjust: "Adjusted",
  count: "Counted (stocktake)",
  waste: "Wasted / written off",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  opening: "Opening stock",
};

async function movementsReport(c: Ctx): Promise<ShopReport> {
  const { rows, itemById } = await movementRows(c);
  const byReason = new Map<string, { name: string; count: number; inQty: number; outQty: number; value: number }>();
  const byItem = new Map<string, { name: string; unit: string; received: number; sold: number; wasted: number; adjusted: number; transfers: number }>();
  for (const m of rows) {
    const it = itemById.get(m.inventoryItemId);
    const unitCost = m.unitCost ?? it?.costPrice ?? 0;
    const label = REASON_LABEL[m.reason] ?? m.reason;
    const r = byReason.get(label) ?? { name: label, count: 0, inQty: 0, outQty: 0, value: 0 };
    r.count += 1;
    if (m.change >= 0) r.inQty += m.change;
    else r.outQty += -m.change;
    r.value += m.change * unitCost;
    byReason.set(label, r);
    const p = byItem.get(m.inventoryItemId) ?? { name: it?.name ?? "Deleted item", unit: it?.unit ?? "", received: 0, sold: 0, wasted: 0, adjusted: 0, transfers: 0 };
    if (m.reason === "received" || m.reason === "opening") p.received += m.change;
    else if (m.reason === "sale" || m.reason === "void" || m.reason === "edit" || m.reason === "refund") p.sold -= m.change;
    else if (m.reason === "waste") p.wasted -= m.change;
    else if (m.reason === "adjust" || m.reason === "count") p.adjusted += m.change;
    else p.transfers += m.change;
    byItem.set(m.inventoryItemId, p);
  }
  return {
    title: "Stock movements",
    note: "Every change to stock in the period. “Sold” is net of voids, edits and returned goods. Value is at the cost recorded with the movement (else the item's cost today).",
    tables: [
      {
        title: "By reason",
        columns: [col("name", "What happened"), col("count", "Movements", "int"), col("inQty", "Units in", "qty"), col("outQty", "Units out", "qty"), col("value", "Value at cost", "money")],
        rows: [...byReason.values()].map((r) => ({ ...r, inQty: r3(r.inQty), outQty: r3(r.outQty), value: r2(r.value) })),
        empty: "No stock movements in this period.",
      },
      {
        title: "By item",
        columns: [col("name", "Item"), col("unit", "Unit"), col("received", "Received", "qty"), col("sold", "Sold", "qty"), col("wasted", "Wasted", "qty"), col("adjusted", "Adjusted / counted", "qty"), col("transfers", "Transfers (net)", "qty")],
        rows: [...byItem.values()].map((r) => ({ ...r, received: r3(r.received), sold: r3(r.sold), wasted: r3(r.wasted), adjusted: r3(r.adjusted), transfers: r3(r.transfers) })).sort((a, b) => a.name.localeCompare(b.name)),
      },
    ],
  };
}

async function lossesReport(c: Ctx): Promise<ShopReport> {
  const { rows, itemById } = await movementRows(c, ["waste", "adjust", "count"]);
  const losses = rows.filter((m) => m.change < 0);
  const byReason = new Map<string, { name: string; count: number; units: number; value: number }>();
  const byItem = new Map<string, { name: string; unit: string; units: number; value: number }>();
  let total = 0;
  for (const m of losses) {
    const it = itemById.get(m.inventoryItemId);
    const value = -m.change * (m.unitCost ?? it?.costPrice ?? 0);
    total += value;
    const label =
      m.reason === "count"
        ? "Stocktake shortfall"
        : (m.note ?? "").split(" — ")[0].trim() || (m.reason === "waste" ? "Written off (no reason given)" : "Adjusted down");
    const r = byReason.get(label) ?? { name: label, count: 0, units: 0, value: 0 };
    r.count += 1;
    r.units += -m.change;
    r.value += value;
    byReason.set(label, r);
    const p = byItem.get(m.inventoryItemId) ?? { name: it?.name ?? "Deleted item", unit: it?.unit ?? "", units: 0, value: 0 };
    p.units += -m.change;
    p.value += value;
    byItem.set(m.inventoryItemId, p);
  }
  const wasted = losses.filter((m) => m.reason === "waste").reduce((s, m) => s + -m.change * (m.unitCost ?? itemById.get(m.inventoryItemId)?.costPrice ?? 0), 0);
  const counted = losses.filter((m) => m.reason === "count").reduce((s, m) => s + -m.change * (m.unitCost ?? itemById.get(m.inventoryItemId)?.costPrice ?? 0), 0);
  return {
    title: "Stock losses (shrinkage)",
    note: "Stock written off or found missing: waste, adjustments down and stocktake shortfalls, valued at cost.",
    kpis: [
      { label: "Total lost at cost", value: r2(total), type: "money", warn: total > 0 },
      { label: "Written off / wasted", value: r2(wasted), type: "money" },
      { label: "Stocktake shortfalls", value: r2(counted), type: "money" },
    ],
    tables: [
      {
        title: "By reason",
        columns: [col("name", "Reason"), col("count", "Times", "int"), col("units", "Units", "qty"), col("value", "Lost at cost", "money")],
        rows: [...byReason.values()].map((r) => ({ ...r, units: r3(r.units), value: r2(r.value) })).sort((a, b) => b.value - a.value),
        empty: "No losses recorded in this period.",
      },
      {
        title: "By product",
        columns: [col("name", "Item"), col("unit", "Unit"), col("units", "Units lost", "qty"), col("value", "Lost at cost", "money")],
        rows: [...byItem.values()].map((r) => ({ ...r, units: r3(r.units), value: r2(r.value) })).sort((a, b) => b.value - a.value),
      },
    ],
  };
}

// ---- Dead stock / slow sellers ----------------------------------------------------------------

async function deadReport(c: Ctx, now: number): Promise<ShopReport> {
  const cat = await catalogue(c.restaurantId);
  const sold = await db
    .select({
      id: stockMovements.inventoryItemId,
      last: sql<number>`max(${stockMovements.createdAt})`,
      recent: sql<number>`coalesce(sum(case when ${stockMovements.createdAt} >= ${now - 30 * DAY} then -${stockMovements.change} else 0 end), 0)`,
    })
    .from(stockMovements)
    .where(and(eq(stockMovements.restaurantId, c.restaurantId), eq(stockMovements.reason, "sale")))
    .groupBy(stockMovements.inventoryItemId);
  const byId = new Map(sold.map((s) => [s.id, s]));
  const rows = cat.items
    .filter((i) => i.dishId && i.quantity > 0)
    .map((i) => {
      const s = byId.get(i.id);
      const last = s?.last ?? null;
      const days = last ? Math.floor((now - last) / DAY) : null;
      const perDay = (s?.recent ?? 0) / 30;
      return {
        name: i.name,
        qty: r3(i.quantity),
        value: r2(i.quantity * (i.costPrice ?? 0)),
        last,
        days,
        bucket: days == null ? "Never sold" : days >= 90 ? "90+ days" : days >= 60 ? "60+ days" : days >= 30 ? "30+ days" : "Selling",
        sold30: r3(s?.recent ?? 0),
        cover: perDay > 0 ? Math.round(i.quantity / perDay) : null,
      };
    })
    .filter((r) => r.bucket !== "Selling")
    .sort((a, b) => b.value - a.value);
  const tied = rows.reduce((s, r) => s + r.value, 0);
  return {
    title: "Dead stock & slow sellers",
    note: "Products on hand that have not sold for 30 days or more (or ever), with the money tied up at cost. Days of cover = stock ÷ average daily sales over the last 30 days. Shows today's position, not the chosen dates.",
    kpis: [
      { label: "Products not selling", value: rows.length, type: "int" },
      { label: "Tied up at cost", value: r2(tied), type: "money", warn: tied > 0 },
      { label: "Never sold", value: rows.filter((r) => r.bucket === "Never sold").length, type: "int" },
    ],
    tables: [
      {
        columns: [col("name", "Product"), col("qty", "On hand", "qty"), col("value", "Value at cost", "money"), col("last", "Last sold", "date"), col("days", "Days since", "int"), col("bucket", "Status"), col("sold30", "Sold last 30 days", "qty"), col("cover", "Days of cover", "int")],
        rows,
        empty: "Everything on the shelves has sold in the last 30 days.",
      },
    ],
  };
}

// ---- Weight sold ------------------------------------------------------------------------------

async function weightReport(c: Ctx): Promise<ShopReport> {
  const live = (await ordersInRange(c)).filter((o) => o.status !== "Voided");
  const m = new Map<string, { name: string; unit: string; qty: number; revenue: number; orders: Set<string> }>();
  for (const o of live) {
    for (const it of o.items) {
      if (!it.sellBy || it.sellBy === "unit") continue;
      const key = `${it.dishId}|${it.unit ?? ""}`;
      const r = m.get(key) ?? { name: it.name, unit: it.unit ?? "", qty: 0, revenue: 0, orders: new Set<string>() };
      r.qty += it.qty;
      r.revenue += lineTotal(it);
      r.orders.add(o.id);
      m.set(key, r);
    }
  }
  return {
    title: "Weight sold",
    note: "Products sold by weight, volume or length: how many kg / l / m went out the door.",
    tables: [
      {
        columns: [col("name", "Product"), col("unit", "Unit"), col("qty", "Sold", "qty"), col("revenue", "Revenue", "money"), col("orders", "Sales", "int"), col("avg", "Average per sale", "qty")],
        rows: [...m.values()]
          .map((r) => ({ name: r.name, unit: r.unit, qty: r3(r.qty), revenue: r2(r.revenue), orders: r.orders.size, avg: r.orders.size ? r3(r.qty / r.orders.size) : 0 }))
          .sort((a, b) => b.revenue - a.revenue),
        empty: "Nothing sold by weight in this period.",
      },
    ],
  };
}

// ---- Refunds ----------------------------------------------------------------------------------

async function refundsReport(c: Ctx): Promise<ShopReport> {
  const list = await db.select().from(refunds).where(and(eq(refunds.restaurantId, c.restaurantId), gte(refunds.createdAt, c.range.from), lt(refunds.createdAt, c.range.to)));
  const group = (key: (r: (typeof list)[number]) => string) => {
    const m = new Map<string, { name: string; count: number; amount: number }>();
    for (const r of list) {
      const k = key(r);
      const row = m.get(k) ?? { name: k, count: 0, amount: 0 };
      row.count += 1;
      row.amount += r.amount;
      m.set(k, row);
    }
    return [...m.values()].map((x) => ({ ...x, amount: r2(x.amount) })).sort((a, b) => b.amount - a.amount);
  };
  const byProduct = new Map<string, { name: string; count: number; qty: number; amount: number; back: number }>();
  for (const r of list) {
    for (const it of r.items) {
      const p = byProduct.get(it.name) ?? { name: it.name, count: 0, qty: 0, amount: 0, back: 0 };
      p.count += 1;
      p.qty += it.qty;
      p.amount += it.amount;
      if (it.backToStock) p.back += it.qty;
      byProduct.set(it.name, p);
    }
  }
  const total = list.reduce((s, r) => s + r.amount, 0);
  const cols = (first: string): ShopColumn[] => [col("name", first), col("count", "Refunds", "int"), col("amount", "Amount", "money")];
  return {
    title: "Refunds",
    kpis: [
      { label: "Refunds", value: list.length, type: "int" },
      { label: "Refunded", value: r2(total), type: "money", warn: total > 0 },
    ],
    tables: [
      { title: "By reason", columns: cols("Reason"), rows: group((r) => r.reason?.trim() || "No reason given"), empty: "No refunds in this period." },
      { title: "By method", columns: cols("Refunded to"), rows: group((r) => r.method) },
      { title: "By staff", columns: cols("Staff"), rows: group((r) => r.createdByName ?? "Unattributed") },
      {
        title: "By product",
        columns: [col("name", "Product"), col("count", "Refunds", "int"), col("qty", "Qty", "qty"), col("amount", "Amount", "money"), col("back", "Back in stock", "qty")],
        rows: [...byProduct.values()].map((p) => ({ ...p, qty: r3(p.qty), amount: r2(p.amount), back: r3(p.back) })).sort((a, b) => b.amount - a.amount),
      },
    ],
  };
}

// ---- Promotions -------------------------------------------------------------------------------

async function promosReport(c: Ctx): Promise<ShopReport> {
  const live = (await ordersInRange(c)).filter((o) => o.status !== "Voided");
  const m = new Map<string, { name: string; orders: Set<string>; units: number; saving: number; sales: number }>();
  for (const o of live) {
    for (const it of o.items) {
      if (!it.promo) continue;
      const r = m.get(it.promo.name) ?? { name: it.promo.name, orders: new Set<string>(), units: 0, saving: 0, sales: 0 };
      r.orders.add(o.id);
      r.units += it.qty;
      r.saving += it.promo.saving;
      r.sales += lineTotal(it);
      m.set(it.promo.name, r);
    }
  }
  const rows = [...m.values()].map((r) => ({ name: r.name, orders: r.orders.size, units: r3(r.units), saving: r2(r.saving), sales: r2(r.sales), rate: r.sales + r.saving > 0 ? r.saving / (r.sales + r.saving) : 0 })).sort((a, b) => b.saving - a.saving);
  const saved = rows.reduce((s, r) => s + r.saving, 0);
  return {
    title: "Promotions",
    note: "What each promotion took off, and the sales it priced. Sales that would have happened anyway can't be told apart, so this shows cost and reach rather than a guaranteed uplift.",
    kpis: [
      { label: "Discount given", value: r2(saved), type: "money" },
      { label: "Sales using a promotion", value: new Set(live.filter((o) => o.items.some((i) => i.promo)).map((o) => o.id)).size, type: "int" },
    ],
    tables: [
      {
        columns: [col("name", "Promotion"), col("orders", "Sales", "int"), col("units", "Units", "qty"), col("sales", "Sales value", "money"), col("saving", "Discount given", "money"), col("rate", "Average discount", "pct")],
        rows,
        empty: "No promotions used in this period.",
      },
    ],
  };
}

// ---- Age checks -------------------------------------------------------------------------------

async function ageChecksReport(c: Ctx): Promise<ShopReport> {
  const list = await db.select().from(ageChecks).where(and(eq(ageChecks.restaurantId, c.restaurantId), gte(ageChecks.createdAt, c.range.from), lt(ageChecks.createdAt, c.range.to)));
  const staff = new Map<string, { name: string; approved: number; refused: number }>();
  const product = new Map<string, { name: string; age: number; approved: number; refused: number }>();
  for (const a of list) {
    const s = staff.get(a.staffName ?? "Unattributed") ?? { name: a.staffName ?? "Unattributed", approved: 0, refused: 0 };
    const p = product.get(a.productName) ?? { name: a.productName, age: a.minAge, approved: 0, refused: 0 };
    if (a.result === "approved") {
      s.approved += 1;
      p.approved += 1;
    } else {
      s.refused += 1;
      p.refused += 1;
    }
    staff.set(s.name, s);
    product.set(p.name, p);
  }
  const refused = list.filter((a) => a.result === "refused").length;
  return {
    title: "Age checks",
    note: "The Challenge 25 log: every age-restricted sale approved and every refusal.",
    kpis: [
      { label: "Checks", value: list.length, type: "int" },
      { label: "Approved", value: list.length - refused, type: "int" },
      { label: "Refused", value: refused, type: "int" },
    ],
    tables: [
      {
        title: "By staff",
        columns: [col("name", "Staff"), col("approved", "Approved", "int"), col("refused", "Refused", "int")],
        rows: [...staff.values()].sort((a, b) => b.approved + b.refused - (a.approved + a.refused)),
        empty: "No age checks in this period.",
      },
      {
        title: "By product",
        columns: [col("name", "Product"), col("age", "Minimum age", "int"), col("approved", "Approved", "int"), col("refused", "Refused", "int")],
        rows: [...product.values()].sort((a, b) => b.approved + b.refused - (a.approved + a.refused)),
      },
      {
        title: "Log",
        columns: [col("at", "When", "date"), col("product", "Product"), col("age", "Minimum age", "int"), col("result", "Result"), col("method", "How"), col("staff", "Staff")],
        rows: list
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 500)
          .map((a) => ({ at: a.createdAt, product: a.productName, age: a.minAge, result: a.result === "approved" ? "Approved" : "Refused", method: a.method === "id-checked" ? "ID checked" : a.method === "looks-over-25" ? "Looks over 25" : (a.method ?? ""), staff: a.staffName ?? "" })),
      },
    ],
  };
}

// ---- Supplier spend ---------------------------------------------------------------------------

async function supplierSpendReport(c: Ctx): Promise<ShopReport> {
  const [pos, sups] = await Promise.all([
    db.select().from(purchaseOrders).where(and(eq(purchaseOrders.restaurantId, c.restaurantId), inArray(purchaseOrders.status, ["part_received", "received"]))),
    db.select().from(suppliers).where(eq(suppliers.restaurantId, c.restaurantId)),
  ]);
  const when = (p: (typeof pos)[number]) => p.receivedAt ?? p.sentAt ?? p.createdAt;
  const inRange = pos.filter((p) => when(p) >= c.range.from && when(p) < c.range.to);
  const lines = inRange.length ? await db.select().from(purchaseOrderLines).where(inArray(purchaseOrderLines.purchaseOrderId, inRange.map((p) => p.id))) : [];
  const spend = new Map<string, number>();
  for (const l of lines) spend.set(l.purchaseOrderId, (spend.get(l.purchaseOrderId) ?? 0) + l.qtyReceived * (l.unitCost ?? 0));
  const supName = new Map(sups.map((s) => [s.id, s.name]));
  const bySup = new Map<string, { name: string; orders: number; spend: number }>();
  const byMonth = new Map<string, { name: string; orders: number; spend: number }>();
  for (const p of inRange) {
    const amount = spend.get(p.id) ?? 0;
    const sn = supName.get(p.supplierId) ?? "Unknown supplier";
    const s = bySup.get(sn) ?? { name: sn, orders: 0, spend: 0 };
    s.orders += 1;
    s.spend += amount;
    bySup.set(sn, s);
    const month = businessDateKey(when(p), c.businessDay.openTime, c.businessDay.timezone).slice(0, 7);
    const mo = byMonth.get(month) ?? { name: month, orders: 0, spend: 0 };
    mo.orders += 1;
    mo.spend += amount;
    byMonth.set(month, mo);
  }
  const total = [...bySup.values()].reduce((s, r) => s + r.spend, 0);
  const cols = (first: string): ShopColumn[] => [col("name", first), col("orders", "Purchase orders", "int"), col("spend", "Received at cost", "money")];
  return {
    title: "Supplier spend",
    note: "Goods received against purchase orders (quantity received × the order's unit cost), by the day they were received.",
    kpis: [
      { label: "Spend", value: r2(total), type: "money" },
      { label: "Purchase orders", value: inRange.length, type: "int" },
    ],
    tables: [
      { title: "By supplier", columns: cols("Supplier"), rows: [...bySup.values()].map((r) => ({ ...r, spend: r2(r.spend) })).sort((a, b) => b.spend - a.spend), empty: "No purchase orders received in this period." },
      { title: "By month", columns: cols("Month"), rows: [...byMonth.values()].map((r) => ({ ...r, spend: r2(r.spend) })).sort((a, b) => a.name.localeCompare(b.name)) },
    ],
  };
}

// ---- Expiry -----------------------------------------------------------------------------------

async function expiryReport(c: Ctx, now: number): Promise<ShopReport> {
  const todayKey = businessDateKey(now, c.businessDay.openTime, c.businessDay.timezone);
  const soonKey = businessDateKey(now + 30 * DAY, c.businessDay.openTime, c.businessDay.timezone);
  const [batches, cat, wasted] = await Promise.all([
    db.select().from(stockBatches).where(eq(stockBatches.restaurantId, c.restaurantId)),
    catalogue(c.restaurantId),
    movementRows(c, ["waste"]),
  ]);
  const itemById = new Map(cat.items.map((i) => [i.id, i]));
  const live = batches.filter((b) => b.quantity > 0 && b.expiresOn && b.expiresOn <= soonKey);
  const rows = live
    .map((b) => {
      const it = itemById.get(b.inventoryItemId);
      const days = Math.round((Date.parse(`${b.expiresOn}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / DAY);
      return {
        name: it?.name ?? "Deleted item",
        lot: b.lot ?? "",
        expires: b.expiresOn ?? "",
        days,
        status: days < 0 ? "Expired" : days === 0 ? "Expires today" : "Expiring soon",
        qty: r3(b.quantity),
        value: r2(b.quantity * (it?.costPrice ?? 0)),
      };
    })
    .sort((a, b) => a.days - b.days);
  const expired = rows.filter((r) => r.days < 0);
  const outOfDate = wasted.rows.filter((m) => (m.note ?? "").startsWith("Out of date") && m.change < 0);
  const writtenOff = outOfDate.reduce((s, m) => s + -m.change * (m.unitCost ?? wasted.itemById.get(m.inventoryItemId)?.costPrice ?? 0), 0);
  return {
    title: "Expiry",
    note: "Batches expired or expiring within 30 days (today's position), and what was written off as out of date in the chosen dates.",
    kpis: [
      { label: "Expired, still on the shelf", value: r2(expired.reduce((s, r) => s + r.value, 0)), type: "money", warn: expired.length > 0, hint: `${expired.length} batches` },
      { label: "Expiring in 30 days", value: r2(rows.filter((r) => r.days >= 0).reduce((s, r) => s + r.value, 0)), type: "money", hint: `${rows.filter((r) => r.days >= 0).length} batches` },
      { label: "Written off as out of date", value: r2(writtenOff), type: "money", hint: `${outOfDate.length} write-offs` },
    ],
    tables: [
      {
        title: "Expired and expiring soon",
        columns: [col("name", "Product"), col("lot", "Lot"), col("expires", "Best before"), col("days", "Days left", "int"), col("status", "Status"), col("qty", "Qty", "qty"), col("value", "Value at cost", "money")],
        rows,
        empty: "Nothing is expired or close to its date.",
      },
      {
        title: "Written off as out of date",
        columns: [col("at", "When", "date"), col("name", "Product"), col("qty", "Qty", "qty"), col("value", "Value at cost", "money"), col("note", "Note")],
        rows: outOfDate.map((m) => ({ at: m.createdAt, name: wasted.itemById.get(m.inventoryItemId)?.name ?? "Deleted item", qty: r3(-m.change), value: r2(-m.change * (m.unitCost ?? wasted.itemById.get(m.inventoryItemId)?.costPrice ?? 0)), note: m.note })).sort((a, b) => (b.at as number) - (a.at as number)),
      },
    ],
  };
}

// ---- Aged debt --------------------------------------------------------------------------------

async function agedDebtReport(c: Ctx, now: number): Promise<ShopReport> {
  const accounts = await listTradeAccounts(c.restaurantId);
  const rows = await Promise.all(
    accounts.map(async (a) => {
      const st = await tradeStatement(c.restaurantId, a.id);
      const b = agedDebt(st.lines, a.paymentTermsDays ?? 0, now);
      return { name: a.companyName, balance: r2(st.balance), current: r2(b.current), d1: r2(b.d1_30), d2: r2(b.d31_60), d3: r2(b.d60plus), limit: a.creditLimit ?? null };
    })
  );
  const owing = rows.filter((r) => r.balance > 0.004).sort((a, b) => b.balance - a.balance);
  const sum = (k: "balance" | "current" | "d1" | "d2" | "d3") => r2(owing.reduce((s, r) => s + r[k], 0));
  return {
    title: "Trade / aged debt",
    note: "What trade customers owe today, by how long past due. Payments are matched to the oldest invoices first; an invoice is due after the account's payment terms.",
    kpis: [
      { label: "Owed in total", value: sum("balance"), type: "money" },
      { label: "Not yet due", value: sum("current"), type: "money" },
      { label: "1–30 days late", value: sum("d1"), type: "money", warn: sum("d1") > 0 },
      { label: "31–60 days late", value: sum("d2"), type: "money", warn: sum("d2") > 0 },
      { label: "60+ days late", value: sum("d3"), type: "money", warn: sum("d3") > 0 },
    ],
    tables: [
      {
        columns: [col("name", "Account"), col("balance", "Owes", "money"), col("current", "Not yet due", "money"), col("d1", "1–30 days", "money"), col("d2", "31–60 days", "money"), col("d3", "60+ days", "money"), col("limit", "Credit limit", "money")],
        rows: owing,
        empty: "No trade account owes anything.",
      },
    ],
  };
}

// ---- Multi-site -------------------------------------------------------------------------------

async function multiSiteReport(siteIds: string[]): Promise<ShopReport> {
  const sites = await siteOverview(siteIds);
  return {
    title: "All sites side by side",
    note: "Takings today and over the last 7 days, stock at cost, transfers on the way and tills in use.",
    kpis: [
      { label: "Today (all sites)", value: r2(sites.reduce((s, x) => s + x.today, 0)), type: "money" },
      { label: "Last 7 days (all sites)", value: r2(sites.reduce((s, x) => s + x.week, 0)), type: "money" },
      { label: "Stock at cost (all sites)", value: r2(sites.reduce((s, x) => s + x.stockValue, 0)), type: "money" },
    ],
    tables: [
      {
        columns: [col("name", "Site"), col("today", "Today", "money"), col("orders", "Sales today", "int"), col("week", "Last 7 days", "money"), col("stock", "Stock at cost", "money"), col("transfers", "Transfers on the way", "int"), col("tills", "Tills", "int")],
        rows: sites.map((s) => ({ name: s.name, today: r2(s.today), orders: s.ordersToday, week: r2(s.week), stock: r2(s.stockValue), transfers: s.openTransfers, tills: s.tills.length })),
        empty: "No sites.",
      },
    ],
  };
}

// ---- Shop dashboard ---------------------------------------------------------------------------

async function shopDashReport(c: Ctx): Promise<ShopReport> {
  const span = Math.max(1, c.range.to - c.range.from);
  const [cur, prev, cat, refundRows] = await Promise.all([
    ordersInRange(c),
    ordersInRange(c, c.range.from - span, c.range.from),
    catalogue(c.restaurantId),
    db.select().from(refunds).where(and(eq(refunds.restaurantId, c.restaurantId), gte(refunds.createdAt, c.range.from), lt(refunds.createdAt, c.range.to))),
  ]);
  const figures = (list: Order[]) => {
    const live = list.filter((o) => o.status !== "Voided");
    let net = 0;
    let items = 0;
    let costed = 0;
    let cost = 0;
    for (const o of live) {
      net += orderBreakdown(o).total;
      for (const it of o.items) {
        items += it.sellBy && it.sellBy !== "unit" ? 1 : it.qty;
        const uc = cat.costOf(it);
        const rev = lineTotal(it);
        if (uc != null) {
          costed += rev;
          cost += uc * it.qty;
        }
      }
    }
    return { net, n: live.length, basket: live.length ? net / live.length : 0, perBasket: live.length ? items / live.length : 0, margin: costed > 0 ? (costed - cost) / costed : null, profit: costed - cost };
  };
  const a = figures(cur);
  const b = figures(prev);
  const refunded = refundRows.reduce((s, r) => s + r.amount, 0);
  const stockCost = cat.items.reduce((s, i) => s + Math.max(0, i.quantity) * (i.costPrice ?? 0), 0);
  const low = cat.items.filter((i) => i.quantity >= 0 && i.lowStockThreshold > 0 && i.quantity <= i.lowStockThreshold).length;
  const negative = cat.items.filter((i) => i.quantity < 0).length;
  const vs = (now: number, before: number) => (before > 0 ? `${now >= before ? "+" : ""}${Math.round(((now - before) / before) * 100)}% vs the period before` : undefined);
  const top = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const o of cur.filter((x) => x.status !== "Voided")) {
    for (const it of o.items) {
      const r = top.get(it.name) ?? { name: it.name, qty: 0, revenue: 0 };
      r.qty += it.qty;
      r.revenue += lineTotal(it);
      top.set(it.name, r);
    }
  }
  return {
    title: "Shop dashboard",
    kpis: [
      { label: "Net sales", value: r2(a.net), type: "money", hint: vs(a.net, b.net) },
      { label: "Transactions", value: a.n, type: "int", hint: vs(a.n, b.n) },
      { label: "Average basket", value: r2(a.basket), type: "money", hint: vs(a.basket, b.basket) },
      { label: "Items per basket", value: r2(a.perBasket), type: "qty" },
      { label: "Refunds", value: r2(refunded), type: "money", hint: `${refundRows.length} refunds`, warn: refunded > 0 },
      { label: "Margin", value: a.margin ?? "–", type: "pct", hint: a.margin == null ? "Set cost prices on products" : undefined },
      { label: "Stock value (at cost)", value: r2(stockCost), type: "money" },
      { label: "Low stock", value: low, type: "int", warn: low > 0 },
      { label: "Negative stock", value: negative, type: "int", warn: negative > 0 },
    ],
    tables: [
      {
        title: "Best sellers",
        columns: [col("name", "Product"), col("qty", "Qty", "qty"), col("revenue", "Revenue", "money")],
        rows: [...top.values()].map((r) => ({ name: r.name, qty: r3(r.qty), revenue: r2(r.revenue) })).sort((x, y) => y.revenue - x.revenue).slice(0, 15),
        empty: "No sales in this period.",
      },
    ],
  };
}

export async function getShopReport(
  restaurantId: string,
  tab: string,
  range: { from: number; to: number },
  businessDay: BusinessDayConfig,
  opts: { by?: string; siteIds?: string[]; accountsFilter?: { defaultTerminalName: string | null } } = {}
): Promise<ShopReport | null> {
  const c: Ctx = { restaurantId, range, businessDay, accountsFilter: opts.accountsFilter };
  const now = Date.now();
  switch (tab) {
    case "shopdash":
      return shopDashReport(c);
    case "margin":
      return marginReport(c, opts.by ?? "product");
    case "stockvalue":
      return stockValueReport(c);
    case "movements":
      return movementsReport(c);
    case "losses":
      return lossesReport(c);
    case "dead":
      return deadReport(c, now);
    case "weight":
      return weightReport(c);
    case "refundsr":
      return refundsReport(c);
    case "promos":
      return promosReport(c);
    case "agechecks":
      return ageChecksReport(c);
    case "supplierspend":
      return supplierSpendReport(c);
    case "expiry":
      return expiryReport(c, now);
    case "agedebt":
      return agedDebtReport(c, now);
    case "multisite":
      return multiSiteReport(opts.siteIds ?? [restaurantId]);
    default:
      return null;
  }
}
