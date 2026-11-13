"use client";

import { useState, useTransition } from "react";
import { Power } from "lucide-react";
import { setRestaurantKillSwitchAction } from "@/lib/actions/kill-switch";

// The business admin's own kill switch: stops this business's till, kitchen screens, staff logins and online
// ordering at once. The admin's own dashboard keeps working so they can switch it back on. If Super Admin
// switched the business off instead ("super"), it's locked and this card never renders (the admin can't get in).
export function BusinessKillSwitch({ restaurantId, initialOff }: { restaurantId: string; initialOff: boolean }) {
  const [off, setOff] = useState(initialOff);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(next: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await setRestaurantKillSwitchAction(restaurantId, next);
      if (r.ok) {
        setOff(next);
        setConfirming(false);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className={`mb-6 rounded-2xl border p-4 ${off ? "border-rose-300 bg-rose-50" : "border-neutral-200 bg-white"}`} data-testid="business-kill-switch">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${off ? "bg-rose-600 text-white" : "bg-neutral-100 text-neutral-600"}`}>
            <Power className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              Kill switch · {off ? <span className="text-rose-700">YOUR BUSINESS IS SWITCHED OFF</span> : "running"}
            </h2>
            <p className="mt-0.5 max-w-xl text-sm text-neutral-600">
              {off
                ? "The Till, Kitchen Display, staff and PIN logins and online ordering are all blocked. Only admins can sign in. Switch it back on when you're ready."
                : "Switch it on to stop the Till, Kitchen Display, staff and PIN logins and online ordering at once. You stay signed in so you can switch it back on."}
            </p>
          </div>
        </div>
        {!confirming && (
          <button
            onClick={() => (off ? apply(false) : setConfirming(true))}
            disabled={pending}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${off ? "bg-teal-600 hover:bg-teal-700" : "bg-rose-600 hover:bg-rose-700"}`}
          >
            {pending ? "Working…" : off ? "Switch back on" : "Switch business off"}
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-white p-3">
          <p className="text-sm text-neutral-800">This stops every till, kitchen screen, staff login and online order for your business right now. Continue?</p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => apply(true)} disabled={pending} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
              {pending ? "Switching off…" : "Yes, switch it off"}
            </button>
            <button onClick={() => setConfirming(false)} disabled={pending} className="rounded-xl border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
