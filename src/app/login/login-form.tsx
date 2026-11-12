"use client";

import { useActionState, useEffect, useRef } from "react";
import { Mail, Lock } from "lucide-react";
import { loginAction, type LoginState } from "@/lib/actions/auth";

const initialState: LoginState = {};
const SAVED_USER_KEY = "iq-saved-username";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const emailRef = useRef<HTMLInputElement>(null);
  const rememberRef = useRef<HTMLInputElement>(null);

  // A username saved on this device by "Keep me signed in" is filled in for next time (the password
  // is the browser's / phone's own password manager's job — the field is marked up so it offers to).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVED_USER_KEY);
      if (saved && emailRef.current && !emailRef.current.value) emailRef.current.value = saved;
    } catch {
      // storage unavailable — nothing to prefill
    }
  }, []);

  function rememberOnSubmit(form: HTMLFormElement) {
    const data = new FormData(form);
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");
    const keep = rememberRef.current?.checked ?? false;
    try {
      if (keep && email) localStorage.setItem(SAVED_USER_KEY, email);
      else localStorage.removeItem(SAVED_USER_KEY);
    } catch {
      // ignore
    }
    // Chrome-style browsers: hand the sign-in to the browser's password manager so it offers to save it.
    const w = window as unknown as { PasswordCredential?: new (init: { id: string; password: string }) => Credential };
    if (keep && w.PasswordCredential && navigator.credentials && email && password) {
      try {
        navigator.credentials.store(new w.PasswordCredential({ id: email, password })).catch(() => {});
      } catch {
        // not supported here
      }
    }
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => rememberOnSubmit(e.currentTarget)}
      className="space-y-4"
    >
      <div>
        <label className="mb-1.5 block text-xs font-medium text-neutral-500">Username (your email)</label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            ref={emailRef}
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="you@restaurant.com"
            aria-label="Username"
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

      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-neutral-600">
        <input ref={rememberRef} type="checkbox" name="remember" defaultChecked className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-teal-600" />
        <span>
          Keep me signed in &amp; save my login
          <span className="block text-xs text-neutral-400">Remembers your username here and keeps you signed in for 30 days. Untick on a shared computer.</span>
        </span>
      </label>

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
