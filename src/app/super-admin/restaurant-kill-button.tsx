"use client";

import { useTransition } from "react";
import { Power } from "lucide-react";
import { setRestaurantKillSwitchAction } from "@/lib/actions/kill-switch";

// Super Admin's per-business kill switch, on each business card. "Off" here is the locked kind: nobody at
// that business — admin included — can get in, and the admin can't undo it.
export function RestaurantKillButton({ restaurantId, name, level }: { restaurantId: string; name: string; level: "admin" | "super" | null }) {
  const [pending, startTransition] = useTransition();
  const off = level !== null;

  function toggle() {
    if (!off && !window.confirm(`Switch ${name} off? Its till, kitchen screens, staff and admin logins and online ordering stop working until you switch it back on.`)) return;
    startTransition(async () => {
      await setRestaurantKillSwitchAction(restaurantId, !off);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={off ? `${name} is switched off${level === "admin" ? " by its admin" : ""} — click to switch it on` : `Switch ${name} off`}
      className={`flex shrink-0 items-center rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-60 ${
        off ? "border-rose-300 bg-rose-600 text-white hover:bg-rose-700" : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
      }`}
    >
      <Power className="h-4 w-4" />
    </button>
  );
}
