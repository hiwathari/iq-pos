import { roundMoney, type OrderItem } from "@/lib/types";

// Promotions (docs/retail-plan step 5.3): multi-buy ("3 for £2"), buy N get M free, % or £ off,
// and bundles / meal deals. A pure module used by the Till (to show the price live) and by the
// server (placeOrderAction recomputes everything — the client's figures are never trusted, like
// coupons). A promotion's saving is written onto the order lines it touches as an exact line
// total (`fixedTotal`) plus a `promo` note, so tax, stock, refunds, receipts and reports need no
// special handling.
//
// Rules of the game: only counted products with a plain price take part (no weighed lines, scale
// labels or manual price changes); each unit is in at most one promotion; where several could
// apply, the one saving the customer most goes first; coupons and manual discounts come off
// afterwards, as they always did.

export type PromoKind = "multibuy_price" | "multibuy_free" | "percent_off" | "amount_off" | "bundle";

export interface PromoScope {
  productIds?: string[];
  categoryIds?: string[];
}

export interface PromoRules {
  scope?: PromoScope;
  // multibuy_price: any `qty` of the scope cost `price` together
  qty?: number;
  price?: number;
  // multibuy_free: for every `buy` + `free` units, the cheapest `free` cost nothing
  buy?: number;
  free?: number;
  // percent_off / amount_off
  percent?: number;
  amount?: number;
  // bundle: one pick per slot (or `count` of them) for `bundlePrice`
  slots?: { name?: string; scope: PromoScope; count: number }[];
  bundlePrice?: number;
}

export interface PromotionDef {
  id: string;
  name: string;
  kind: PromoKind;
  rules: PromoRules;
  startsAt: number | null;
  endsAt: number | null;
  active: boolean;
  channels: string[] | null;
}

export interface PromoContext {
  now: number;
  channel: string;
  categoryOf: (dishId: string) => string | null;
}

export interface AppliedPromotion {
  id: string;
  name: string;
  saving: number;
}

// An order's lines back in plain form for editing: a promotion's price is dropped (it's worked out
// again live from the basket).
export function stripPromo(it: OrderItem): OrderItem {
  if (!it.promo) return it;
  const { promo, fixedTotal, ...rest } = it;
  void promo;
  void fixedTotal;
  return rest;
}

export const PROMO_KIND_LABELS: Record<PromoKind, string> = {
  multibuy_price: "Multi-buy price (3 for £2)",
  multibuy_free: "Buy some, get some free",
  percent_off: "Percent off",
  amount_off: "Amount off each",
  bundle: "Bundle / meal deal",
};

type Unit = { line: number; price: number };
type Group = { units: Unit[]; total: number };

function inScope(scope: PromoScope | undefined, dishId: string, ctx: PromoContext) {
  if (!scope) return false;
  if (scope.productIds?.includes(dishId)) return true;
  const cat = ctx.categoryOf(dishId);
  return !!cat && !!scope.categoryIds?.includes(cat);
}

export function promoIsLive(p: PromotionDef, ctx: Pick<PromoContext, "now" | "channel">) {
  if (!p.active) return false;
  if (p.startsAt != null && ctx.now < p.startsAt) return false;
  if (p.endsAt != null && ctx.now > p.endsAt) return false;
  if (p.channels && p.channels.length > 0 && !p.channels.includes(ctx.channel)) return false;
  return true;
}

// The groups of units this promotion would take from what's left — each group costs `total`.
function groupsFor(p: PromotionDef, remaining: number[], items: OrderItem[], ctx: PromoContext): Group[] {
  const pool = (scope: PromoScope | undefined) => {
    const units: Unit[] = [];
    items.forEach((it, line) => {
      if (inScope(scope, it.dishId, ctx)) for (let n = 0; n < remaining[line]; n++) units.push({ line, price: it.price });
    });
    return units.sort((a, b) => b.price - a.price || a.line - b.line);
  };
  const r = p.rules;
  const groups: Group[] = [];

  if (p.kind === "multibuy_price") {
    const qty = Math.floor(r.qty ?? 0);
    if (qty < 2 || r.price == null || r.price < 0) return [];
    const units = pool(r.scope);
    for (let at = 0; at + qty <= units.length; at += qty) groups.push({ units: units.slice(at, at + qty), total: roundMoney(r.price) });
  } else if (p.kind === "multibuy_free") {
    const buy = Math.floor(r.buy ?? 0);
    const free = Math.floor(r.free ?? 0);
    if (buy < 1 || free < 1) return [];
    const size = buy + free;
    const units = pool(r.scope);
    for (let at = 0; at + size <= units.length; at += size) {
      const g = units.slice(at, at + size);
      groups.push({ units: g, total: roundMoney(g.slice(0, buy).reduce((s, u) => s + u.price, 0)) });
    }
  } else if (p.kind === "percent_off") {
    const pct = r.percent ?? 0;
    if (!(pct > 0 && pct <= 100)) return [];
    for (const u of pool(r.scope)) groups.push({ units: [u], total: roundMoney(u.price * (1 - pct / 100)) });
  } else if (p.kind === "amount_off") {
    const amt = r.amount ?? 0;
    if (!(amt > 0)) return [];
    for (const u of pool(r.scope)) groups.push({ units: [u], total: roundMoney(Math.max(0, u.price - amt)) });
  } else if (p.kind === "bundle") {
    const slots = r.slots ?? [];
    if (slots.length === 0 || r.bundlePrice == null || r.bundlePrice < 0 || slots.some((s) => !(s.count >= 1))) return [];
    const left = [...remaining];
    for (;;) {
      const picked: Unit[] = [];
      const taken = new Map<number, number>();
      let complete = true;
      for (const slot of slots) {
        const candidates: Unit[] = [];
        items.forEach((it, line) => {
          if (inScope(slot.scope, it.dishId, ctx)) {
            const avail = left[line] - (taken.get(line) ?? 0);
            for (let n = 0; n < avail; n++) candidates.push({ line, price: it.price });
          }
        });
        candidates.sort((a, b) => b.price - a.price || a.line - b.line);
        if (candidates.length < slot.count) {
          complete = false;
          break;
        }
        for (const u of candidates.slice(0, slot.count)) {
          picked.push(u);
          taken.set(u.line, (taken.get(u.line) ?? 0) + 1);
        }
      }
      if (!complete) break;
      for (const [line, n] of taken) left[line] -= n;
      groups.push({ units: picked, total: roundMoney(r.bundlePrice) });
    }
  }
  // A group only counts if it really saves the customer money.
  return groups.filter((g) => g.units.reduce((s, u) => s + u.price, 0) - g.total > 0.004);
}

const groupSaving = (g: Group) => g.units.reduce((s, u) => s + u.price, 0) - g.total;

// Returns the items with promotion prices applied (lines touched get an exact `fixedTotal` and a
// `promo` note; untouched lines are returned as they were) and the promotions that applied.
export function applyPromotions(items: OrderItem[], promotions: PromotionDef[], ctx: PromoContext) {
  // Start from the plain items: drop what an earlier pass set.
  const base: OrderItem[] = items.map((it) => {
    if (!it.promo) return it;
    const { promo, fixedTotal, ...rest } = it;
    void promo;
    void fixedTotal;
    return rest;
  });
  const live = promotions.filter((p) => promoIsLive(p, ctx));
  if (live.length === 0) return { items: base, applied: [] as AppliedPromotion[] };

  const remaining = base.map((it) =>
    it.dishId.startsWith("custom:") || (it.sellBy && it.sellBy !== "unit") || it.fixedTotal != null || it.priceOverride || !Number.isInteger(it.qty) || it.price <= 0
      ? 0
      : it.qty
  );
  type Adj = { units: number; regular: number; promo: number; names: Set<string>; firstId: string };
  const adj = new Map<number, Adj>();
  const applied = new Map<string, AppliedPromotion>();
  let candidates = [...live];

  for (;;) {
    let best: { p: PromotionDef; groups: Group[]; saving: number } | null = null;
    for (const p of candidates) {
      const groups = groupsFor(p, remaining, base, ctx);
      const saving = groups.reduce((s, g) => s + groupSaving(g), 0);
      if (saving > 0.004 && (!best || saving > best.saving)) best = { p, groups, saving };
    }
    if (!best) break;
    candidates = candidates.filter((c) => c.id !== best!.p.id);
    for (const g of best.groups) {
      const regular = g.units.reduce((s, u) => s + u.price, 0);
      let given = 0;
      g.units.forEach((u, idx) => {
        const share = idx === g.units.length - 1 ? roundMoney(g.total - given) : roundMoney((u.price / regular) * g.total);
        given = roundMoney(given + share);
        remaining[u.line] -= 1;
        const a = adj.get(u.line) ?? { units: 0, regular: 0, promo: 0, names: new Set<string>(), firstId: best!.p.id };
        a.units += 1;
        a.regular = roundMoney(a.regular + u.price);
        a.promo = roundMoney(a.promo + share);
        a.names.add(best!.p.name);
        adj.set(u.line, a);
      });
      const cur = applied.get(best.p.id) ?? { id: best.p.id, name: best.p.name, saving: 0 };
      cur.saving = roundMoney(cur.saving + (regular - g.total));
      applied.set(best.p.id, cur);
    }
  }

  const out = base.map((it, line) => {
    const a = adj.get(line);
    if (!a) return it;
    return {
      ...it,
      fixedTotal: roundMoney(a.promo + (it.qty - a.units) * it.price),
      promo: { id: a.firstId, name: [...a.names].join(" + "), saving: roundMoney(a.regular - a.promo) },
    };
  });
  return { items: out, applied: [...applied.values()] };
}

// "Buy 3 Coke → £2.00, saves £0.67" — the live example shown while creating a promotion.
export function describePromotion(p: Pick<PromotionDef, "kind" | "rules">, symbol: string, names: { scope: (s?: PromoScope) => string }) {
  const r = p.rules;
  const money = (n: number) => `${symbol}${n.toFixed(2)}`;
  switch (p.kind) {
    case "multibuy_price":
      return `${r.qty ?? "?"} × ${names.scope(r.scope)} for ${money(r.price ?? 0)}`;
    case "multibuy_free":
      return `Buy ${r.buy ?? "?"} ${names.scope(r.scope)}, get ${r.free ?? "?"} free`;
    case "percent_off":
      return `${r.percent ?? "?"}% off ${names.scope(r.scope)}`;
    case "amount_off":
      return `${money(r.amount ?? 0)} off each ${names.scope(r.scope)}`;
    case "bundle":
      return `${(r.slots ?? []).map((s) => `${s.count > 1 ? `${s.count} × ` : ""}${s.name || names.scope(s.scope)}`).join(" + ")} for ${money(r.bundlePrice ?? 0)}`;
  }
}
