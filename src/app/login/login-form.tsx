"use client";

import { useActionState } from "react";
import { Mail, Lock } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

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
            placeholder="you@restaurant.com"
            className="w-full rounded-xl border border-neutral-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-500">Password</label>
        <div className="relative">
          <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-xl border border-neutral-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
          />
        </div>
      </div>

      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-teal-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
