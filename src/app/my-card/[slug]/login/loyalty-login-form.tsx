"use client";

import { useActionState } from "react";
import { Mail } from "lucide-react";
import { requestLoyaltyMagicLinkAction, type MagicLinkRequestState } from "@/lib/actions/loyalty-auth";

const initialState: MagicLinkRequestState = {};

export function LoyaltyLoginForm({ restaurantSlug }: { restaurantSlug: string }) {
  const requestForRestaurant = requestLoyaltyMagicLinkAction.bind(null, restaurantSlug);
  const [state, formAction, pending] = useActionState(requestForRestaurant, initialState);

  if (state.sent) {
    return (
      <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
        If that email has a loyalty card with us, a sign-in link is on its way — check your inbox.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-500">Email</label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            className="w-full rounded-xl border border-neutral-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-light)]"
          />
        </div>
      </div>

      {state.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send Sign-In Link"}
      </button>
    </form>
  );
}
