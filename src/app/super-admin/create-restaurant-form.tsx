"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createRestaurantAction, type CreateRestaurantState } from "@/lib/actions/restaurants";
import { BUSINESS_TYPES, businessProfile } from "@/lib/business-profile";
import type { BusinessType } from "@/lib/types";

const initialState: CreateRestaurantState = {};

export function CreateRestaurantForm({ onDone }: { onDone: () => void }) {
  const [state, formAction, pending] = useActionState(createRestaurantAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState<BusinessType>("restaurant");
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) {
      formRef.current?.reset();
      onDone();
    }
    wasPending.current = pending;
  }, [pending, state, onDone]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-500">Business Name</label>
        <input
          name="name"
          required
          placeholder="e.g. Burger Barn"
          className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-500">Business Type</label>
        <select
          name="businessType"
          value={type}
          onChange={(e) => setType(e.target.value as BusinessType)}
          className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
        >
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t}>
              {businessProfile(t).label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-neutral-400">
          {businessProfile(type).hint}.{" "}
          {businessProfile(type).defaultCategories.length > 0 &&
            `Starts with ${businessProfile(type).defaultCategories.length} categories and their VAT rates. `}
          Editable later in Settings.
        </p>
      </div>
      <div className="border-t border-neutral-100 pt-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">First Admin Account</p>
        <div className="space-y-3">
          <input
            name="adminName"
            required
            placeholder="Admin full name"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          <input
            name="adminEmail"
            type="email"
            required
            placeholder="admin@restaurant.com"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
          <input
            name="adminPassword"
            type="password"
            required
            minLength={8}
            placeholder="Temporary password (min 8 chars)"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
      </div>

      {state?.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-teal-600 py-2.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create Business"}
      </button>
    </form>
  );
}
