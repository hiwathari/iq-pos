"use client";

import { useState, useTransition } from "react";
import { Building2, ChefHat, Check, Copy, Globe, Palette, Plus, ShoppingBag, Table2, Users, X } from "lucide-react";
import {
  impersonateRestaurantAction,
  toggleRestaurantActiveAction,
  updateRestaurantBrandingAction,
  updateRestaurantOnlineOrderingAction,
  type OnlineOrderingSettingsInput,
} from "@/lib/actions/restaurants";
import { DEFAULT_BRAND_COLOR, isValidHexColor } from "@/lib/color";
import { CreateRestaurantForm } from "./create-restaurant-form";

interface RestaurantRow {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  staffCount: number;
  dishCount: number;
  tableCount: number;
  orderCount: number;
  invoiceLogoUrl: string | null;
  brandColor: string | null;
  onlineOrderingEnabled: boolean;
  qrTableOrderingEnabled: boolean;
  kioskOrderingEnabled: boolean;
  customDomain: string | null;
}

export function SuperAdminClient({
  restaurants,
  totals,
}: {
  restaurants: RestaurantRow[];
  totals: { restaurantCount: number; userCount: number; orderCount: number };
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [brandingTarget, setBrandingTarget] = useState<RestaurantRow | null>(null);
  const [orderingTarget, setOrderingTarget] = useState<RestaurantRow | null>(null);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-neutral-900">Super Admin</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
        >
          <Plus className="h-4 w-4" /> Add Restaurant
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Restaurants" value={String(totals.restaurantCount)} tint="bg-teal-50 text-teal-600" />
        <StatCard icon={Users} label="Platform Users" value={String(totals.userCount)} tint="bg-indigo-50 text-indigo-600" />
        <StatCard icon={ShoppingBag} label="Orders Placed" value={String(totals.orderCount)} tint="bg-amber-50 text-amber-600" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {restaurants.map((r) => (
          <div key={r.id} className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-3 flex items-start justify-between">
              <div className="flex items-center gap-3">
                {r.invoiceLogoUrl ? (
                  <img src={r.invoiceLogoUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-contain" />
                ) : (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: r.brandColor ?? DEFAULT_BRAND_COLOR }}
                  >
                    {r.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <div>
                  <h2 className="font-semibold text-neutral-900">{r.name}</h2>
                  <p className="text-xs text-neutral-400">/{r.slug}</p>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  r.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {r.active ? "Active" : "Suspended"}
              </span>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs text-neutral-500">
              <div className="rounded-lg bg-neutral-50 py-2">
                <Users className="mx-auto mb-1 h-3.5 w-3.5" />
                {r.staffCount} staff
              </div>
              <div className="rounded-lg bg-neutral-50 py-2">
                <ChefHat className="mx-auto mb-1 h-3.5 w-3.5" />
                {r.dishCount} dishes
              </div>
              <div className="rounded-lg bg-neutral-50 py-2">
                <Table2 className="mx-auto mb-1 h-3.5 w-3.5" />
                {r.tableCount} tables
              </div>
            </div>

            <div className="mt-auto flex gap-2">
              <form action={impersonateRestaurantAction.bind(null, r.id)} className="flex-1">
                <button
                  type="submit"
                  className="w-full rounded-xl bg-teal-600 py-2 text-xs font-semibold text-white hover:bg-teal-700"
                >
                  Manage
                </button>
              </form>
              <button
                onClick={() => setBrandingTarget(r)}
                title="Logo & brand color"
                className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
              >
                <Palette className="h-4 w-4" />
              </button>
              <button
                onClick={() => setOrderingTarget(r)}
                title="Online ordering & domain"
                className={`rounded-xl border px-3 py-2 text-xs font-medium ${
                  r.onlineOrderingEnabled ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-neutral-200 text-neutral-600"
                } hover:bg-neutral-50`}
              >
                <Globe className="h-4 w-4" />
              </button>
              <form action={toggleRestaurantActiveAction.bind(null, r.id, !r.active)}>
                <button
                  type="submit"
                  className="rounded-xl border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  {r.active ? "Suspend" : "Reactivate"}
                </button>
              </form>
            </div>
          </div>
        ))}
        {restaurants.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 py-16 text-center text-sm text-neutral-400">
            No restaurants yet. Create the first one to get started.
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">Add Restaurant</h2>
              <button onClick={() => setModalOpen(false)} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <CreateRestaurantForm onDone={() => setModalOpen(false)} />
          </div>
        </div>
      )}

      {brandingTarget && <BrandingModal restaurant={brandingTarget} onClose={() => setBrandingTarget(null)} />}
      {orderingTarget && <OnlineOrderingModal restaurant={orderingTarget} onClose={() => setOrderingTarget(null)} />}
    </div>
  );
}

function BrandingModal({ restaurant, onClose }: { restaurant: RestaurantRow; onClose: () => void }) {
  const [logoUrl, setLogoUrl] = useState(restaurant.invoiceLogoUrl ?? "");
  const [brandColor, setBrandColor] = useState(restaurant.brandColor ?? DEFAULT_BRAND_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (brandColor && !isValidHexColor(brandColor)) {
      setError("Brand color must be a hex value like #0D9488.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateRestaurantBrandingAction(restaurant.id, { logoUrl, brandColor });
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Branding</h2>
            <p className="text-xs text-neutral-400">{restaurant.name}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-medium text-neutral-500">Logo URL</label>
        <input
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://…/logo.png"
          className="mb-4 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm focus:border-teal-500 focus:outline-none"
        />

        <label className="mb-1 block text-xs font-medium text-neutral-500">Brand Color</label>
        <div className="mb-1 flex items-center gap-3">
          <input
            type="color"
            value={isValidHexColor(brandColor) ? brandColor : DEFAULT_BRAND_COLOR}
            onChange={(e) => setBrandColor(e.target.value)}
            className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-neutral-200"
          />
          <input
            value={brandColor}
            onChange={(e) => setBrandColor(e.target.value)}
            placeholder="#0D9488"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm uppercase focus:border-teal-500 focus:outline-none"
          />
        </div>
        <p className="mb-4 text-xs text-neutral-400">
          Applied to this restaurant&apos;s primary buttons and active states across the Till, Kitchen Display, and admin
          sidebar. Leave blank to use IQ POS&apos;s default teal.
        </p>

        {error && <p className="mb-4 text-xs font-medium text-rose-600">{error}</p>}

        <button
          onClick={submit}
          disabled={pending}
          className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save Branding"}
        </button>
      </div>
    </div>
  );
}

function OnlineOrderingModal({ restaurant, onClose }: { restaurant: RestaurantRow; onClose: () => void }) {
  const [onlineOrderingEnabled, setOnlineOrderingEnabled] = useState(restaurant.onlineOrderingEnabled);
  const [qrTableOrderingEnabled, setQrTableOrderingEnabled] = useState(restaurant.qrTableOrderingEnabled);
  const [kioskOrderingEnabled, setKioskOrderingEnabled] = useState(restaurant.kioskOrderingEnabled);
  const [customDomain, setCustomDomain] = useState(restaurant.customDomain ?? "");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const defaultLink = typeof window !== "undefined" ? `${window.location.origin}/order/${restaurant.slug}` : `/order/${restaurant.slug}`;

  function copyLink() {
    navigator.clipboard.writeText(defaultLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function submit() {
    setError(null);
    const input: OnlineOrderingSettingsInput = { onlineOrderingEnabled, qrTableOrderingEnabled, kioskOrderingEnabled, customDomain };
    startTransition(async () => {
      const result = await updateRestaurantOnlineOrderingAction(restaurant.id, input);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Online Ordering</h2>
            <p className="text-xs text-neutral-400">{restaurant.name}</p>
          </div>
          <button onClick={onClose} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 space-y-3">
          <ToggleRow
            label="Online Ordering"
            description="Turns on the public /order link — required for QR and kiosk ordering below."
            checked={onlineOrderingEnabled}
            onChange={setOnlineOrderingEnabled}
          />
          <ToggleRow
            label="QR Table Ordering"
            description="Customers can select a table, or land on one automatically from a printed table QR code."
            checked={qrTableOrderingEnabled}
            onChange={setQrTableOrderingEnabled}
            disabled={!onlineOrderingEnabled}
          />
          <ToggleRow
            label="Kiosk Ordering"
            description="Enables the walk-up /order/<slug>/kiosk screen — no sign-in required."
            checked={kioskOrderingEnabled}
            onChange={setKioskOrderingEnabled}
            disabled={!onlineOrderingEnabled}
          />
        </div>

        {onlineOrderingEnabled && (
          <div className="mb-5 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="mb-1 text-xs font-medium text-neutral-500">Default ordering link (always works)</div>
            <div className="flex items-center gap-2">
              <span className="flex-1 truncate font-mono text-xs text-neutral-700">{defaultLink}</span>
              <button onClick={copyLink} className="shrink-0 rounded-lg border border-neutral-200 bg-white p-1.5 text-neutral-500 hover:bg-neutral-50">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        )}

        <label className="mb-1 block text-xs font-medium text-neutral-500">Custom Domain (optional)</label>
        <input
          value={customDomain}
          onChange={(e) => setCustomDomain(e.target.value)}
          placeholder="order.therestaurant.com"
          className="mb-2 w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500"
        />
        <div className="mb-4 space-y-1.5 rounded-xl bg-amber-50 p-3 text-xs text-amber-700">
          <p className="font-semibold">Once saved, point its DNS here — then tell us so we can attach it in Vercel:</p>
          <p>
            Subdomain (e.g. <span className="font-mono">order.yoursite.com</span>): CNAME → <span className="font-mono">cname.vercel-dns.com</span>
          </p>
          <p>
            Root domain (e.g. <span className="font-mono">yoursite.com</span>): A record → <span className="font-mono">76.76.21.21</span>
          </p>
          <p>The /order/&lt;slug&gt; link above always works regardless — this is an optional, nicer-looking alias.</p>
        </div>

        {error && <p className="mb-4 text-xs font-medium text-rose-600">{error}</p>}

        <button
          onClick={submit}
          disabled={pending}
          className="w-full rounded-xl bg-teal-600 py-3 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-xl border border-neutral-200 p-3 ${disabled ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-teal-600"
      />
      <span>
        <span className="block text-sm font-semibold text-neutral-800">{label}</span>
        <span className="block text-xs text-neutral-400">{description}</span>
      </span>
    </label>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5">
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-neutral-400">{label}</div>
        <div className="text-lg font-semibold text-neutral-900">{value}</div>
      </div>
    </div>
  );
}
