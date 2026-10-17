"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Plus } from "lucide-react";
import { createAccountsLoginAction } from "@/lib/actions/staff";

export function AccountsLoginClient({
  accountsLogin,
  canManage,
}: {
  accountsLogin: { email: string; name: string; active: boolean } | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createAccountsLoginAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-900">Accounts Login</h2>
      <p className="mb-4 max-w-2xl text-sm text-neutral-500">
        A bookkeeping login for this restaurant. It sees cash and the default card machine in full, and other card
        machines for the last 2 weeks only. Its password is always the same as the restaurant admin&apos;s, and changes
        automatically when the admin&apos;s does.
      </p>

      {accountsLogin ? (
        <div className="flex max-w-xl items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-600">
            <Calculator className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-neutral-900">{accountsLogin.email}</div>
            <div className="truncate text-xs text-neutral-500">{accountsLogin.name}</div>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
              accountsLogin.active ? "bg-emerald-50 text-emerald-700" : "bg-neutral-100 text-neutral-500"
            }`}
          >
            {accountsLogin.active ? "Active" : "Inactive"}
          </span>
        </div>
      ) : canManage ? (
        <div className="max-w-xl rounded-xl border border-dashed border-neutral-300 px-4 py-4">
          <p className="text-sm text-neutral-600">This restaurant doesn&apos;t have an accounts login yet.</p>
          <button
            onClick={create}
            disabled={pending}
            className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {pending ? "Creating…" : "Create accounts login"}
          </button>
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
      ) : (
        <p className="text-sm text-neutral-400">No accounts login set up for this restaurant.</p>
      )}
    </div>
  );
}
