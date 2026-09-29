"use client";

import { useActionState, useState } from "react";
import { Mail } from "lucide-react";

type RequestState = { error?: string; sent?: boolean };
type VerifyState = { error?: string };

// Shared by the admin-facing /my-card login and the customer ordering sign-in gate — both are
// "sign in to your loyalty account via email," delivered as a clickable link (handled by a
// Route Handler elsewhere) or this typed 6-digit code. The caller supplies its own pre-bound
// actions so this component doesn't need to know which flow it's in.
export function LoyaltySignInForm({
  requestAction,
  verifyAction,
  description,
}: {
  requestAction: (state: RequestState, formData: FormData) => Promise<RequestState>;
  verifyAction: (state: VerifyState, formData: FormData) => Promise<VerifyState>;
  description: string;
}) {
  const [requestState, requestFormAction, requestPending] = useActionState(requestAction, {});
  const [verifyState, verifyFormAction, verifyPending] = useActionState(verifyAction, {});
  const [email, setEmail] = useState("");

  if (requestState.sent) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
          Check your email for a sign-in link — or enter the 6-digit code from that email below.
        </p>
        <form action={verifyFormAction} className="space-y-3">
          <input type="hidden" name="email" value={email} />
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            className="w-full rounded-xl border border-neutral-200 px-3.5 py-3 text-center text-lg font-mono tracking-[0.3em] outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-light)]"
          />
          {verifyState.error && <p className="text-sm font-medium text-rose-600">{verifyState.error}</p>}
          <button
            type="submit"
            disabled={verifyPending}
            className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {verifyPending ? "Verifying…" : "Verify Code"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form action={requestFormAction} className="space-y-4">
      <p className="text-sm text-neutral-500">{description}</p>
      <div className="relative">
        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          className="w-full rounded-xl border border-neutral-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-light)]"
        />
      </div>

      {requestState.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{requestState.error}</p>}

      <button
        type="submit"
        disabled={requestPending}
        className="w-full rounded-xl bg-[var(--brand)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--brand-dark)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {requestPending ? "Sending…" : "Continue"}
      </button>
    </form>
  );
}
