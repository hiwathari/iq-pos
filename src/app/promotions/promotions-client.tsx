"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Percent, Plus, Search, Trash2, X } from "lucide-react";
import { deletePromotionAction, savePromotionAction, setPromotionActiveAction } from "@/lib/actions/promotions";
import { applyPromotions, describePromotion, PROMO_KIND_LABELS, type PromoKind, type PromoRules, type PromoScope, type PromotionDef } from "@/lib/promotions";
import type { OrderItem } from "@/lib/types";

type Product = { id: string; name: string; price: number; categoryId: string };
type Category = { id: string; name: string };
type Row = PromotionDef & { createdAt: number };

const toLocalInput = (ms: number | null) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const fromLocalInput = (v: string) => (v ? new Date(v).getTime() : null);

export function PromotionsClient({
  promotions,
  products,
  categories,
  channels,
  currencySymbol,
  productWord,
}: {
  promotions: Row[];
  products: Product[];
  categories: Category[];
  channels: string[];
  currencySymbol: string;
  productWord: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  // eslint-disable-next-line react-hooks/purity
  const now = useMemo(() => Date.now(), []);

  const scopeName = (s?: PromoScope) => {
    const names = [
      ...(s?.productIds ?? []).map((id) => products.find((p) => p.id === id)?.name),
      ...(s?.categoryIds ?? []).map((id) => categories.find((c) => c.id === id)?.name),
    ].filter(Boolean) as string[];
    return names.length === 0 ? `any ${productWord}` : names.length <= 2 ? names.join(" / ") : `${names[0]} +${names.length - 1} more`;
  };
  const status = (p: Row) => (!p.active ? "Off" : p.startsAt && now < p.startsAt ? "Scheduled" : p.endsAt && now > p.endsAt ? "Ended" : "Live");
  const tone: Record<string, string> = { Live: "bg-emerald-50 text-emerald-700", Off: "bg-neutral-100 text-neutral-500", Scheduled: "bg-sky-50 text-sky-700", Ended: "bg-rose-50 text-rose-600" };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">Promotions</h1>
          <p className="text-sm text-neutral-400">Multi-buys, free items, % off and meal deals — applied automatically on the Till the moment the basket qualifies, and taken off again if an item is removed.</p>
        </div>
        <button onClick={() => setEditing("new")} className="flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)]">
          <Plus className="h-4 w-4" /> New Promotion
        </button>
      </div>

      <div className="space-y-3">
        {promotions.map((p) => (
          <div key={p.id} className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-light)] text-[var(--brand-dark)]">
              <Percent className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-neutral-800">{p.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${tone[status(p)]}`}>{status(p)}</span>
              </div>
              <div className="text-sm text-neutral-500">{describePromotion(p, currencySymbol, { scope: scopeName })}</div>
              {(p.startsAt || p.endsAt) && (
                <div className="text-xs text-neutral-400">
                  {p.startsAt ? `from ${new Date(p.startsAt).toLocaleDateString("en-GB")}` : ""} {p.endsAt ? `until ${new Date(p.endsAt).toLocaleDateString("en-GB")}` : ""}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={p.active}
                onChange={(e) => startTransition(async () => { await setPromotionActiveAction(p.id, e.target.checked); router.refresh(); })}
                className="h-4 w-4 accent-[var(--brand)]"
                aria-label={`${p.name} on`}
              />
              On
            </label>
            <button onClick={() => setEditing(p)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-[var(--brand-dark)]" aria-label={`Edit ${p.name}`}>
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => confirm(`Delete "${p.name}"?`) && startTransition(async () => { await deletePromotionAction(p.id); router.refresh(); })}
              className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
              aria-label={`Delete ${p.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {promotions.length === 0 && <p className="rounded-2xl border border-neutral-200 bg-white px-5 py-10 text-center text-neutral-400">No promotions yet.</p>}
      </div>

      {editing && (
        <PromotionModal
          initial={editing === "new" ? null : editing}
          products={products}
          categories={categories}
          channels={channels}
          currencySymbol={currencySymbol}
          scopeName={scopeName}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ScopePicker({ value, onChange, products, categories, label }: { value: PromoScope; onChange: (s: PromoScope) => void; products: Product[]; categories: Category[]; label: string }) {
  const [q, setQ] = useState("");
  const matches = q.trim() ? products.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()) && !value.productIds?.includes(p.id)).slice(0, 6) : [];
  const toggleCat = (id: string) => {
    const cur = value.categoryIds ?? [];
    onChange({ ...value, categoryIds: cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id] });
  };
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-neutral-500">{label}</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {categories.map((c) => (
          <button key={c.id} type="button" onClick={() => toggleCat(c.id)} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${value.categoryIds?.includes(c.id) ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 text-neutral-600"}`}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(value.productIds ?? []).map((id) => (
          <span key={id} className="flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700">
            {products.find((p) => p.id === id)?.name ?? "Removed"}
            <button type="button" onClick={() => onChange({ ...value, productIds: (value.productIds ?? []).filter((x) => x !== id) })} aria-label="Remove">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative mt-2">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Add a specific product…" className="w-full rounded-xl border border-neutral-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-teal-500" />
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full rounded-xl border border-neutral-200 bg-white shadow-lg">
            {matches.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { onChange({ ...value, productIds: [...(value.productIds ?? []), p.id] }); setQ(""); }} className="w-full px-3.5 py-2 text-left text-sm hover:bg-neutral-50">
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PromotionModal({
  initial,
  products,
  categories,
  channels,
  currencySymbol,
  scopeName,
  onClose,
  onSaved,
}: {
  initial: Row | null;
  products: Product[];
  categories: Category[];
  channels: string[];
  currencySymbol: string;
  scopeName: (s?: PromoScope) => string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<PromoKind>(initial?.kind ?? "multibuy_price");
  const r0 = initial?.rules ?? {};
  const [scope, setScope] = useState<PromoScope>(r0.scope ?? {});
  const [qty, setQty] = useState(String(r0.qty ?? 3));
  const [price, setPrice] = useState(r0.price != null ? String(r0.price) : "");
  const [buy, setBuy] = useState(String(r0.buy ?? 2));
  const [free, setFree] = useState(String(r0.free ?? 1));
  const [percent, setPercent] = useState(r0.percent != null ? String(r0.percent) : "");
  const [amount, setAmount] = useState(r0.amount != null ? String(r0.amount) : "");
  const [slots, setSlots] = useState<{ name: string; scope: PromoScope; count: string }[]>(
    (r0.slots ?? [{ name: "Main", scope: {}, count: 1 }, { name: "Drink", scope: {}, count: 1 }]).map((s) => ({ name: s.name ?? "", scope: s.scope, count: String(s.count) }))
  );
  const [bundlePrice, setBundlePrice] = useState(r0.bundlePrice != null ? String(r0.bundlePrice) : "");
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? null));
  const [onChannels, setOnChannels] = useState<string[]>(initial?.channels ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rules: PromoRules =
    kind === "bundle"
      ? { slots: slots.map((s) => ({ name: s.name, scope: s.scope, count: Number(s.count) })), bundlePrice: Number(bundlePrice) }
      : kind === "multibuy_price"
        ? { scope, qty: Number(qty), price: Number(price) }
        : kind === "multibuy_free"
          ? { scope, buy: Number(buy), free: Number(free) }
          : kind === "percent_off"
            ? { scope, percent: Number(percent) }
            : { scope, amount: Number(amount) };

  // Live example: a basket that just qualifies, priced by the same function the Till uses.
  const example = (() => {
    const def: PromotionDef = { id: "x", name: name || "This promotion", kind, rules, startsAt: null, endsAt: null, active: true, channels: null };
    const catOf = (id: string) => products.find((p) => p.id === id)?.categoryId ?? null;
    const pick = (s?: PromoScope) => products.filter((p) => s?.productIds?.includes(p.id) || s?.categoryIds?.includes(p.categoryId)).sort((a, b) => b.price - a.price)[0];
    const items: OrderItem[] = [];
    const add = (p: Product | undefined, n: number) => {
      if (p && n > 0) items.push({ dishId: p.id, name: p.name, price: p.price, qty: n });
    };
    if (kind === "bundle") for (const s of rules.slots ?? []) add(pick(s.scope), s.count || 1);
    else if (kind === "multibuy_price") add(pick(scope), rules.qty ?? 0);
    else if (kind === "multibuy_free") add(pick(scope), (rules.buy ?? 0) + (rules.free ?? 0));
    else add(pick(scope), 1);
    if (items.length === 0) return null;
    const out = applyPromotions(items, [def], { now: 0, channel: "", categoryOf: catOf });
    const regular = items.reduce((s, i) => s + i.price * i.qty, 0);
    const total = out.items.reduce((s, i) => s + (i.fixedTotal ?? i.price * i.qty), 0);
    if (regular - total <= 0.004) return `${items.map((i) => `${i.qty} × ${i.name}`).join(" + ")} — no saving yet, check the numbers.`;
    return `${items.map((i) => `${i.qty} × ${i.name}`).join(" + ")} = ${currencySymbol}${total.toFixed(2)} instead of ${currencySymbol}${regular.toFixed(2)} — saves ${currencySymbol}${(regular - total).toFixed(2)}`;
  })();

  function save() {
    startTransition(async () => {
      const res = await savePromotionAction(initial?.id ?? null, { name, kind, rules, startsAt: fromLocalInput(startsAt), endsAt: fromLocalInput(endsAt), active: initial?.active ?? true, channels: onChannels });
      if (res.error) return setError(res.error);
      onSaved();
    });
  }

  const input = "w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500";
  const label = "mb-1 block text-xs font-medium text-neutral-500";
  void scopeName;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Promotion">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">{initial ? "Edit Promotion" : "New Promotion"}</h2>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Name (shown on receipts)</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 3 for £2 cans" className={input} />
            </div>
            <div>
              <label className={label}>Kind</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as PromoKind)} className={input}>
                {(Object.keys(PROMO_KIND_LABELS) as PromoKind[]).map((k) => (
                  <option key={k} value={k}>
                    {PROMO_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {kind !== "bundle" && <ScopePicker value={scope} onChange={setScope} products={products} categories={categories} label="Applies to (categories and/or products)" />}

          {kind === "multibuy_price" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Buy this many</label>
                <input type="number" min="2" value={qty} onChange={(e) => setQty(e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>For a total of ({currencySymbol})</label>
                <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
              </div>
            </div>
          )}
          {kind === "multibuy_free" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={label}>Buy</label>
                <input type="number" min="1" value={buy} onChange={(e) => setBuy(e.target.value)} className={input} />
              </div>
              <div>
                <label className={label}>Get this many free (the cheapest)</label>
                <input type="number" min="1" value={free} onChange={(e) => setFree(e.target.value)} className={input} />
              </div>
            </div>
          )}
          {kind === "percent_off" && (
            <div>
              <label className={label}>Percent off</label>
              <input type="number" min="1" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} className={input} />
            </div>
          )}
          {kind === "amount_off" && (
            <div>
              <label className={label}>Amount off each ({currencySymbol})</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
            </div>
          )}
          {kind === "bundle" && (
            <div className="space-y-3">
              {slots.map((s, i) => (
                <div key={i} className="rounded-xl border border-neutral-200 p-3">
                  <div className="mb-2 grid grid-cols-[1fr_5rem_auto] items-end gap-2">
                    <div>
                      <label className={label}>Part {i + 1} name</label>
                      <input value={s.name} onChange={(e) => setSlots((cur) => cur.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={input} />
                    </div>
                    <div>
                      <label className={label}>How many</label>
                      <input type="number" min="1" value={s.count} onChange={(e) => setSlots((cur) => cur.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))} className={input} />
                    </div>
                    {slots.length > 2 && (
                      <button type="button" onClick={() => setSlots((cur) => cur.filter((_, j) => j !== i))} className="mb-1 rounded-lg p-2 text-neutral-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove part">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <ScopePicker value={s.scope} onChange={(sc) => setSlots((cur) => cur.map((x, j) => (j === i ? { ...x, scope: sc } : x)))} products={products} categories={categories} label="Can be chosen from" />
                </div>
              ))}
              <button type="button" onClick={() => setSlots((cur) => [...cur, { name: "", scope: {}, count: "1" }])} className="text-sm font-semibold text-[var(--brand-dark)] hover:underline">
                + Add a part
              </button>
              <div>
                <label className={label}>Bundle price ({currencySymbol})</label>
                <input type="number" min="0" step="0.01" value={bundlePrice} onChange={(e) => setBundlePrice(e.target.value)} className={input} />
              </div>
            </div>
          )}

          {example && <p className="rounded-xl bg-[var(--brand-light)] px-3.5 py-2.5 text-sm text-[var(--brand-dark)]">{example}</p>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Starts (optional)</label>
              <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={input} />
            </div>
            <div>
              <label className={label}>Ends (optional)</label>
              <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={input} />
            </div>
          </div>
          <div>
            <div className={label}>Only for (leave empty for every way of selling)</div>
            <div className="flex flex-wrap gap-1.5">
              {channels.map((c) => (
                <button key={c} type="button" onClick={() => setOnChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${onChannels.includes(c) ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-neutral-200 text-neutral-600"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error && <p className="mt-3 text-xs font-medium text-rose-600">{error}</p>}
        <button disabled={pending} onClick={save} className="mt-4 w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50">
          {initial ? "Save Changes" : "Create Promotion"}
        </button>
      </div>
    </div>
  );
}
