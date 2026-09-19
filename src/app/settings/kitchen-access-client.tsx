"use client";

import { useTransition } from "react";
import { KeyRound } from "lucide-react";
import { generateKitchenPinAction } from "@/lib/actions/restaurants";

export function KitchenAccessClient({ kitchenPin }: { kitchenPin: string | null }) {
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      await generateKitchenPinAction();
    });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">Kitchen Display Access</h2>
      <p className="mb-4 text-sm text-neutral-500">
        On the kitchen screen, open <span className="font-mono text-neutral-700">/kitchen-login</span> and enter this
        code to unlock the Kitchen Display — no staff sign-in needed on that device.
      </p>
      <div className="flex max-w-sm items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex-1">
          <div className="text-xs font-medium text-neutral-400">Access Code</div>
          <div className="font-mono text-xl font-bold tracking-widest text-neutral-900">
            {kitchenPin ?? "— — — — — —"}
          </div>
        </div>
        <button
          onClick={generate}
          disabled={pending}
          className="flex items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
        >
          <KeyRound className="h-3.5 w-3.5" /> {kitchenPin ? "Regenerate" : "Generate Code"}
        </button>
      </div>
    </div>
  );
}
