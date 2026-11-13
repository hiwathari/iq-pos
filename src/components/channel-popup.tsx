"use client";

import { useState } from "react";
import { Bike, Globe, MapPin, Phone, ShoppingBag, User, Users, X } from "lucide-react";
import type { OrderChannel, ThirdPartyProvider } from "@/lib/types";

export interface ChannelDetails {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  thirdPartyProvider: ThirdPartyProvider;
}

const META: Partial<Record<OrderChannel, { title: string; hint: string; Icon: typeof ShoppingBag }>> = {
  "Take Away": { title: "Take away", hint: "Who is collecting it?", Icon: ShoppingBag },
  Online: { title: "Online order", hint: "Who is it for? (optional)", Icon: Globe },
  Delivery: { title: "Delivery", hint: "Where is it going?", Icon: Bike },
  "Third Party": { title: "3rd party order", hint: "Which app is it from?", Icon: Users },
};

const inputClass = "w-full rounded-xl border border-neutral-200 px-4 py-3 text-base outline-none focus:border-[var(--brand)]";

// What the Till shows when Take away, Online, Delivery or 3rd party is tapped — the same kind of popup as Tables, with just the
// details that order type needs. "Skip" closes it without changes; the details can be reopened from the order panel.
export function ChannelPopup({
  channel,
  initial,
  providers,
  onConfirm,
  onClose,
}: {
  channel: OrderChannel;
  initial: ChannelDetails;
  providers: readonly ThirdPartyProvider[];
  onConfirm: (details: ChannelDetails) => void;
  onClose: () => void;
}) {
  const meta = META[channel] ?? { title: channel, hint: "", Icon: ShoppingBag };
  const [d, setD] = useState<ChannelDetails>(initial);
  const set = <K extends keyof ChannelDetails>(k: K, v: ChannelDetails[K]) => setD((x) => ({ ...x, [k]: v }));
  const needsAddress = channel === "Delivery" && !d.customerAddress.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 bg-[var(--brand)] px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 [&>svg]:size-6">
              <meta.Icon />
            </span>
            <div>
              <h2 className="text-xl font-bold leading-tight">{meta.title}</h2>
              <p className="text-sm text-white/80">{meta.hint}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 hover:bg-white/25">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {channel === "Third Party" ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {providers.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => set("thirdPartyProvider", p)}
                  className={`min-h-16 rounded-2xl border-2 px-3 py-3 text-base font-bold transition active:scale-[0.97] ${
                    d.thirdPartyProvider === p ? "border-[var(--brand)] bg-[var(--brand)] text-white shadow-sm" : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-neutral-500">
                  <User className="h-4 w-4" /> Customer name
                </label>
                <input autoFocus value={d.customerName} onChange={(e) => set("customerName", e.target.value)} placeholder="e.g. Sarah" className={inputClass} />
              </div>
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-neutral-500">
                  <Phone className="h-4 w-4" /> Phone
                </label>
                <input value={d.customerPhone} inputMode="tel" onChange={(e) => set("customerPhone", e.target.value)} placeholder="+44 7000 000000" className={inputClass} />
              </div>
              {channel === "Delivery" && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-neutral-500">
                    <MapPin className="h-4 w-4" /> Delivery address
                  </label>
                  <textarea value={d.customerAddress} onChange={(e) => set("customerAddress", e.target.value)} rows={3} placeholder="Flat, street, postcode…" className={inputClass + " resize-none"} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex gap-3 border-t border-neutral-100 p-4">
          <button onClick={onClose} className="min-h-12 flex-1 rounded-xl border border-neutral-200 px-4 py-3 text-base font-semibold text-neutral-600 hover:bg-neutral-50">
            Skip
          </button>
          <button
            onClick={() => onConfirm(d)}
            disabled={needsAddress}
            title={needsAddress ? "Add the delivery address" : undefined}
            className="min-h-12 flex-[2] rounded-xl bg-[var(--brand)] px-4 py-3 text-base font-bold text-white hover:bg-[var(--brand-dark)] disabled:opacity-40"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
