"use client";

import { useState, useTransition } from "react";
import { Power } from "lucide-react";
import { setKillSwitchAction } from "@/lib/actions/kill-switch";

// The emergency stop. Switching it on makes every page, API call, sign-in and PIN login fail for
// everyone except a Super Admin signed in here; switching it off puts everything back as it was.
export function KillSwitchCard({ initialOn, updatedAt }: { initialOn: boolean; updatedAt: number | null }) {
  const [on, setOn] = useState(initialOn);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function apply(next: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        const r = await setKillSwitchAction(next);
        setOn(r.on);
        setConfirming(false);
      } catch {
        setError("Couldn't change the kill switch — try again.");
      }
    });
  }

  return (
    <div
      className={`mb-6 rounded-2xl border p-4 ${on ? "border-rose-300 bg-rose-50" : "border-neutral-200 bg-white"}`}
      data-testid="kill-switch-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl ${on ? "bg-rose-600 text-white" : "bg-neutral-100 text-neutral-600"}`}>
            <Power className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">
              Kill switch · {on ? <span className="text-rose-700">SYSTEM IS OFF</span> : "system is running"}
            </h2>
            <p className="mt-0.5 max-w-xl text-sm text-neutral-600">
              {on
                ? "Every page, till, kitchen screen, online ordering page, API call and sign-in is blocked for everyone except Super Admin. Staff who were signed in carry on where they were once you switch it off."
                : "Switch it on to stop everything at once: only a Super Admin can sign in and nothing else on the platform will respond."}
              {on && updatedAt ? <span className="block text-xs text-neutral-500">Switched off since {new Date(updatedAt).toLocaleString()}.</span> : null}
            </p>
          </div>
        </div>
        {!confirming && (
          <button
            onClick={() => (on ? apply(false) : setConfirming(true))}
            disabled={pending}
            className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${on ? "bg-teal-600 hover:bg-teal-700" : "bg-rose-600 hover:bg-rose-700"}`}
          >
            {pending ? "Working…" : on ? "Switch the system back on" : "Switch everything off"}
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-white p-3">
          <p className="text-sm text-neutral-800">
            This stops <strong>every</strong> business on the platform immediately — tills, kitchen screens, logins, online orders and the websites. Only you stay signed in. Continue?
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={() => apply(true)} disabled={pending} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
              {pending ? "Switching off…" : "Yes, switch everything off"}
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
