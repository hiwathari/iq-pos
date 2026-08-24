"use client";

import { ShieldAlert } from "lucide-react";
import { stopImpersonationAction } from "@/lib/actions/restaurants";

export function ImpersonationBanner({ restaurantName }: { restaurantName: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-400/90 px-6 py-2 text-sm font-medium text-amber-950">
      <span className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4" />
        Super Admin — managing <strong>{restaurantName}</strong>
      </span>
      <form action={stopImpersonationAction}>
        <button type="submit" className="rounded-lg bg-amber-950/10 px-3 py-1 font-semibold hover:bg-amber-950/20">
          Exit
        </button>
      </form>
    </div>
  );
}
