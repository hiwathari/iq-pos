"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissAutoVoidNoticeAction } from "@/lib/actions/restaurants";
import type { Order } from "@/lib/types";
import { AlertTriangle, X } from "lucide-react";

export function AutoVoidNotice({ orders }: { orders: Order[] }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [, startTransition] = useTransition();

  if (orders.length === 0 || dismissed) return null;

  function dismiss() {
    setDismissed(true);
    startTransition(async () => {
      await dismissAutoVoidNoticeAction();
      router.refresh();
    });
  }

  return (
    <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-rose-800">
          <AlertTriangle className="h-4 w-4" />
          {orders.length} order{orders.length === 1 ? "" : "s"} carried over from a previous day{" "}
          {orders.length === 1 ? "was" : "were"} auto-cancelled
        </h2>
        <button onClick={dismiss} className="rounded-lg p-1 text-rose-400 hover:bg-rose-100">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-3 mt-1 text-xs text-rose-700">
        These never got sent to the kitchen or served before the day ended, so they were voided automatically and their
        tables freed up.
      </p>
      <div className="space-y-1.5">
        {orders.slice(0, 6).map((o) => (
          <div key={o.id} className="flex items-center justify-between text-xs text-rose-800">
            <span>
              Order #{o.orderNumber} · {o.tableNumber ? `Table ${String(o.tableNumber).padStart(2, "0")}` : o.channel}
            </span>
            <span className="text-rose-500">{new Date(o.createdAt).toLocaleDateString()}</span>
          </div>
        ))}
        {orders.length > 6 && <div className="text-xs italic text-rose-500">+{orders.length - 6} more</div>}
      </div>
    </div>
  );
}
